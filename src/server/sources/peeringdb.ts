// PeeringDB, mirrored in memory: networks, organisations, exchanges and their
// peering LANs, exchange ports, facilities and public contacts. The first
// load downloads every object type once; after that only changes are fetched
// with `since`, the way peeringdb-py syncs, and a full download replaces the
// copy once a day. Requests are spaced out and carry an API key when one is
// set, to stay inside PeeringDB's query limits.
// https://docs.peeringdb.com/howto/work_within_peeringdbs_query_limits/
import '@tanstack/react-start/server-only'

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { covers, parseIp, parsePrefix, type Prefix } from '~/lib/ip'
import { parseIrrAsSet } from '~/lib/analysis/peeringdb'
import type {
  PdbAvailability,
  PdbIxConnection,
  PdbNetRef,
  PdbNetwork,
  PdbPrefixInfo,
} from '~/lib/analysis/types'
import { singletonDataset } from '../dataset'
import { env } from '../env'

const USER_AGENT = 'irrexplorer-ng (PeeringDB sync)'

const text = z
  .string()
  .nullish()
  .transform((v) => v ?? '')
const int = z
  .number()
  .int()
  .nullish()
  .transform((v) => v ?? null)
const flag = z
  .boolean()
  .nullish()
  .transform((v) => v ?? false)
const ref = z.number().int()
const base = { id: z.number().int(), status: z.string() }

// Only the fields the app shows are kept; zod drops the rest.
const SCHEMAS = {
  org: z.object({ ...base, name: text, website: text, city: text, country: text }),
  net: z.object({
    ...base,
    org_id: ref,
    asn: z.number().int(),
    name: text,
    aka: text,
    name_long: text,
    website: text,
    looking_glass: text,
    route_server: text,
    irr_as_set: text,
    info_type: text,
    info_types: z
      .array(z.string())
      .nullish()
      .transform((v) => v ?? []),
    info_prefixes4: int,
    info_prefixes6: int,
    info_traffic: text,
    info_ratio: text,
    info_scope: text,
    info_unicast: flag,
    info_multicast: flag,
    info_ipv6: flag,
    info_never_via_route_servers: flag,
    notes: text,
    policy_url: text,
    policy_general: text,
    policy_locations: text,
    policy_ratio: flag,
    policy_contracts: text,
    status_dashboard: text,
    created: text,
    updated: text,
  }),
  ix: z.object({ ...base, org_id: ref, name: text, city: text, country: text }),
  ixlan: z.object({ ...base, ix_id: ref }),
  ixpfx: z.object({ ...base, ixlan_id: ref, prefix: z.string(), in_dfz: flag }),
  netixlan: z.object({
    ...base,
    net_id: ref,
    ix_id: ref,
    /** The exchange name, with the LAN's name where an exchange has several. */
    name: text,
    asn: z.number().int(),
    speed: z
      .number()
      .nullish()
      .transform((v) => v ?? 0),
    ipaddr4: z.string().nullish(),
    ipaddr6: z.string().nullish(),
    is_rs_peer: flag,
    bfd_support: flag,
    operational: flag,
  }),
  fac: z.object({ ...base, org_id: ref, name: text, city: text, country: text }),
  netfac: z.object({ ...base, net_id: ref, fac_id: ref, local_asn: int }),
  poc: z.object({
    ...base,
    net_id: ref,
    role: text,
    visible: text,
    name: text,
    phone: text,
    email: text,
    url: text,
  }),
}

export type PdbType = keyof typeof SCHEMAS
export const PDB_TYPES = Object.keys(SCHEMAS) as PdbType[]
type Row<K extends PdbType> = z.infer<(typeof SCHEMAS)[K]>
export type PdbTables = { [K in PdbType]: Map<number, Row<K>> }

type Net = Row<'net'>
type Port = Row<'netixlan'>

export interface PeeringDb {
  tables: PdbTables
  /** Epoch seconds when the last successful sync started. */
  syncedAt: number
  /** Epoch seconds of the last full download. */
  fullAt: number
  netByAsn: Map<number, Net>
  portsByNet: Map<number, Port[]>
  facsByNet: Map<number, Row<'netfac'>[]>
  contactsByNet: Map<number, Row<'poc'>[]>
  portsByIp: Map<string, Port[]>
  lans: { prefix: Prefix; row: Row<'ixpfx'> }[]
  netsBySet: Map<string, Net[]>
}

/**
 * Rows to keep: live objects only, and contacts only where PeeringDB shows
 * them to everyone. Contacts it limits to logged-in users are never stored,
 * because this app shows its data to anyone who can reach it.
 */
function keep(type: PdbType, row: { status: string; visible?: string }): boolean {
  if (row.status !== 'ok') return false
  return type !== 'poc' || row.visible === 'Public'
}

/** Apply a batch of rows (a full list or a `since` delta) to one table. */
export function applyRows<K extends PdbType>(
  type: K,
  table: PdbTables[K],
  rows: readonly unknown[],
): void {
  const schema = SCHEMAS[type]
  let bad = 0
  for (const raw of rows) {
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      bad++
      continue
    }
    const row = parsed.data as Row<K>
    if (keep(type, row)) table.set(row.id, row)
    else table.delete(row.id)
  }
  if (bad > Math.max(10, rows.length / 100))
    throw new Error(`PeeringDB ${type}: ${bad} of ${rows.length} objects failed validation`)
}

function emptyTables(): PdbTables {
  return Object.fromEntries(PDB_TYPES.map((t) => [t, new Map()])) as unknown as PdbTables
}

function cloneTables(t: PdbTables): PdbTables {
  return Object.fromEntries(
    PDB_TYPES.map((k) => [k, new Map<number, unknown>(t[k] as Map<number, unknown>)]),
  ) as unknown as PdbTables
}

function group<T>(rows: Iterable<T>, key: (r: T) => number | string | null): Map<never, T[]> {
  const out = new Map<number | string, T[]>()
  for (const r of rows) {
    const k = key(r)
    if (k === null) continue
    const list = out.get(k)
    if (list) list.push(r)
    else out.set(k, [r])
  }
  return out as Map<never, T[]>
}

const ipKey = (text: string | null | undefined): string | null => {
  const ip = text ? parseIp(text) : null
  return ip ? `${ip.version}:${ip.value}` : null
}

export function buildPeeringDb(tables: PdbTables, syncedAt: number, fullAt: number): PeeringDb {
  const nets = [...tables.net.values()]
  const ports = [...tables.netixlan.values()]
  const portsByIp = new Map<string, Port[]>()
  for (const p of ports) {
    for (const k of [ipKey(p.ipaddr4), ipKey(p.ipaddr6)]) {
      if (!k) continue
      const list = portsByIp.get(k)
      if (list) list.push(p)
      else portsByIp.set(k, [p])
    }
  }
  const netsBySet = new Map<string, Net[]>()
  for (const n of nets) {
    for (const s of parseIrrAsSet(n.irr_as_set)) {
      const list = netsBySet.get(s.name)
      if (list) {
        if (!list.includes(n)) list.push(n)
      } else netsBySet.set(s.name, [n])
    }
  }
  const lans: PeeringDb['lans'] = []
  for (const row of tables.ixpfx.values()) {
    const prefix = parsePrefix(row.prefix)
    if (prefix) lans.push({ prefix, row })
  }
  return {
    tables,
    syncedAt,
    fullAt,
    netByAsn: new Map(nets.map((n) => [n.asn, n])),
    portsByNet: group(ports, (p) => p.net_id),
    facsByNet: group(tables.netfac.values(), (f) => f.net_id),
    contactsByNet: group(tables.poc.values(), (c) => c.net_id),
    portsByIp,
    lans,
    netsBySet,
  }
}

function httpError(status: number): Error {
  if (status === 401 || status === 403)
    return new Error(`PeeringDB rejected the API key (HTTP ${status})`)
  if (status === 429) return new Error('PeeringDB query limit reached (HTTP 429)')
  return new Error(`HTTP ${status} from PeeringDB`)
}

const Envelope = z.object({ data: z.array(z.unknown()) })

async function fetchType(type: PdbType, since: number | null): Promise<unknown[]> {
  const e = env()
  // Appended, not resolved, so a base URL with a path (a proxy, the e2e mock) keeps it.
  const url = new URL(`${e.PEERINGDB_URL.replace(/\/+$/, '')}/api/${type}`)
  url.searchParams.set('depth', '0')
  if (since !== null) url.searchParams.set('since', String(since))
  const headers: Record<string, string> = { 'user-agent': USER_AGENT, accept: 'application/json' }
  if (e.PEERINGDB_API_KEY) headers.authorization = `Api-Key ${e.PEERINGDB_API_KEY}`
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(180_000) })
  if (!res.ok) throw httpError(res.status)
  return Envelope.parse(await res.json()).data
}

// The cache keeps the projected rows, so a restart does not download it all again.
const CACHE_VERSION = 1
const CacheSchema = z.object({
  version: z.literal(CACHE_VERSION),
  syncedAt: z.number(),
  fullAt: z.number(),
  tables: z.record(z.string(), z.array(z.unknown())),
})

function cacheFile(): string | null {
  const dir = env().BULK_CACHE_DIR
  return dir ? path.join(dir, 'peeringdb.json') : null
}

async function readCache(): Promise<PeeringDb | null> {
  const file = cacheFile()
  if (!file) return null
  try {
    const cached = CacheSchema.parse(JSON.parse(await readFile(file, 'utf8')))
    const tables = emptyTables()
    for (const type of PDB_TYPES) applyRows(type, tables[type], cached.tables[type] ?? [])
    return buildPeeringDb(tables, cached.syncedAt, cached.fullAt)
  } catch {
    return null
  }
}

async function writeCache(db: PeeringDb): Promise<void> {
  const file = cacheFile()
  if (!file) return
  const tmp = `${file}.${process.pid}.tmp`
  const tables = Object.fromEntries(PDB_TYPES.map((t) => [t, [...db.tables[t].values()]]))
  try {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(
      tmp,
      JSON.stringify({ version: CACHE_VERSION, syncedAt: db.syncedAt, fullAt: db.fullAt, tables }),
    )
    await rename(tmp, file)
  } catch (err) {
    console.warn(`[peeringdb] could not cache the mirror: ${String(err)}`)
    await rm(tmp, { force: true }).catch(() => undefined)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let current: PeeringDb | null = null

/** Tests: forget the loaded copy so the next load starts cold. */
export function resetPeeringDb(): void {
  current = null
  peeringdb.set(null)
}

/**
 * Bring the mirror up to date: a full download when there is no copy or the
 * last full one is a day old, otherwise only what changed since the last
 * sync. Exported for tests.
 */
export async function loadPeeringDb(): Promise<PeeringDb> {
  const e = env()
  const started = Math.floor(Date.now() / 1000)
  if (!current) {
    current = await readCache()
    // Serve the cached copy straight away; the sync below may take a minute.
    if (current) peeringdb.set(current)
  }
  const full = !current || started - current.fullAt >= e.PEERINGDB_FULL_SYNC_SECONDS
  const tables = full || !current ? emptyTables() : cloneTables(current.tables)
  // Overlap the window a little so clock skew cannot lose a change.
  const since = full || !current ? null : current.syncedAt - 600
  for (const [i, type] of PDB_TYPES.entries()) {
    if (i > 0) await sleep(e.PEERINGDB_REQUEST_GAP_MS)
    applyRows(type, tables[type], await fetchType(type, since))
  }
  const db = buildPeeringDb(tables, started, full || !current ? started : current.fullAt)
  current = db
  await writeCache(db)
  return db
}

export const peeringdb = singletonDataset<PeeringDb>({
  name: 'PeeringDB',
  source: 'peeringdb',
  refreshSeconds: env().PEERINGDB_REFRESH_SECONDS,
  retrySeconds: 900,
  enabled: () => env().BULK_DATASETS_ENABLED && env().PEERINGDB_ENABLED,
  load: loadPeeringDb,
  size: (db) => db.tables.net.size,
  version: (db) => `synced ${new Date(db.syncedAt * 1000).toISOString()}`,
})

export function peeringdbAvailability(): PdbAvailability {
  if (peeringdb.get()) return 'ok'
  return env().PEERINGDB_ENABLED && env().BULK_DATASETS_ENABLED ? 'unavailable' : 'disabled'
}

function netRef(n: Net): PdbNetRef {
  return { id: n.id, asn: n.asn, name: n.name }
}

function connection(db: PeeringDb, p: Port): PdbIxConnection {
  const ix = db.tables.ix.get(p.ix_id)
  return {
    ixId: p.ix_id,
    ix: p.name || ix?.name || `IX ${p.ix_id}`,
    city: ix?.city ?? '',
    country: ix?.country ?? '',
    speed: p.speed,
    ipv4: p.ipaddr4 ?? null,
    ipv6: p.ipaddr6 ?? null,
    routeServer: p.is_rs_peer,
    bfd: p.bfd_support,
    operational: p.operational,
  }
}

/** Name of a network in PeeringDB, as a fallback where bgp.tools has none. */
export function pdbName(asn: number): string | null {
  return peeringdb.get()?.netByAsn.get(asn)?.name || null
}

/** Everything PeeringDB has on an ASN, or null when it has no record. */
export function pdbNetwork(asn: number): PdbNetwork | null {
  const db = peeringdb.get()
  const n = db?.netByAsn.get(asn)
  if (!db || !n) return null
  const org = db.tables.org.get(n.org_id)
  return {
    id: n.id,
    asn: n.asn,
    name: n.name,
    aka: n.aka,
    nameLong: n.name_long,
    website: n.website,
    org: org
      ? { id: org.id, name: org.name, website: org.website, city: org.city, country: org.country }
      : null,
    types: n.info_types.length > 0 ? n.info_types : n.info_type ? [n.info_type] : [],
    scope: n.info_scope,
    traffic: n.info_traffic,
    ratio: n.info_ratio,
    prefixes4: n.info_prefixes4,
    prefixes6: n.info_prefixes6,
    unicast: n.info_unicast,
    multicast: n.info_multicast,
    ipv6: n.info_ipv6,
    neverViaRouteServers: n.info_never_via_route_servers,
    irrAsSet: n.irr_as_set,
    lookingGlass: n.looking_glass,
    routeServer: n.route_server,
    statusDashboard: n.status_dashboard,
    policy: {
      general: n.policy_general,
      url: n.policy_url,
      locations: n.policy_locations,
      ratio: n.policy_ratio,
      contracts: n.policy_contracts,
    },
    notes: n.notes,
    created: n.created,
    updated: n.updated,
    contacts: (db.contactsByNet.get(n.id) ?? [])
      .map((c) => ({ role: c.role, name: c.name, email: c.email, phone: c.phone, url: c.url }))
      .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name)),
    exchanges: (db.portsByNet.get(n.id) ?? [])
      .map((p) => connection(db, p))
      .sort(
        (a, b) =>
          a.ix.localeCompare(b.ix) ||
          (a.ipv4 ?? a.ipv6 ?? '').localeCompare(b.ipv4 ?? b.ipv6 ?? ''),
      ),
    facilities: (db.facsByNet.get(n.id) ?? [])
      .map((f) => {
        const fac = db.tables.fac.get(f.fac_id)
        return {
          facId: f.fac_id,
          name: fac?.name ?? `Facility ${f.fac_id}`,
          city: fac?.city ?? '',
          country: fac?.country ?? '',
          localAsn: f.local_asn !== null && f.local_asn !== n.asn ? f.local_asn : null,
        }
      })
      .sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name)),
  }
}

/** Exchange peering LANs overlapping a prefix, and the port using a host address. */
export function pdbPrefixInfo(p: Prefix): PdbPrefixInfo | null {
  const db = peeringdb.get()
  if (!db) return null
  const lans = db.lans
    .filter((l) => l.prefix.version === p.version && (covers(l.prefix, p) || covers(p, l.prefix)))
    .map(({ prefix, row }) => {
      const ixId = db.tables.ixlan.get(row.ixlan_id)?.ix_id ?? 0
      const ix = db.tables.ix.get(ixId)
      return {
        ixId,
        ix: ix?.name ?? `IX LAN ${row.ixlan_id}`,
        city: ix?.city ?? '',
        country: ix?.country ?? '',
        prefix: prefix.cidr,
        inDfz: row.in_dfz,
      }
    })
    .sort((a, b) => a.ix.localeCompare(b.ix))
  const isHost = p.length === (p.version === 4 ? 32 : 128)
  const ports = isHost
    ? (db.portsByIp.get(`${p.version}:${p.network}`) ?? []).flatMap((port) => {
        const n = db.tables.net.get(port.net_id)
        return n ? [{ ...connection(db, port), net: netRef(n) }] : []
      })
    : []
  return { lans, ports }
}

/** Networks that name this AS-set as theirs in PeeringDB. */
export function pdbSetUsers(name: string): PdbNetRef[] | null {
  const db = peeringdb.get()
  if (!db) return null
  return (db.netsBySet.get(name.toUpperCase()) ?? []).map(netRef).sort((a, b) => a.asn - b.asn)
}
