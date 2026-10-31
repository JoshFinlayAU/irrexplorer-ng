import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { pdbFixtureRows } from '../peeringdb-fixture'
import { parsePrefix } from '~/lib/ip'
import { resetEnv } from '~/server/env'
import {
  loadPeeringDb,
  pdbName,
  pdbNetwork,
  pdbPrefixInfo,
  pdbSetUsers,
  PDB_TYPES,
  peeringdb,
  peeringdbAvailability,
  resetPeeringDb,
  type PdbType,
} from '~/server/sources/peeringdb'

// With a path, like a proxy or the e2e mock, to check it is kept.
const BASE = 'http://pdb.test/mirror'

let calls: { type: string; since: string | null; auth: string | null }[] = []
// Rows a `since` request returns; a full request returns the fixtures.
let delta: Partial<Record<PdbType, unknown[]>> = {}
let status = 200

const server = setupServer(
  http.get(`${BASE}/api/:type`, ({ request, params }) => {
    const url = new URL(request.url)
    const type = params.type as PdbType
    const since = url.searchParams.get('since')
    calls.push({ type, since, auth: request.headers.get('authorization') })
    if (status !== 200) return new HttpResponse('nope', { status })
    expect(url.searchParams.get('depth')).toBe('0')
    return HttpResponse.json({ meta: {}, data: since ? (delta[type] ?? []) : pdbFixtureRows(type) })
  }),
)

let cacheDir = ''
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(async () => {
  cacheDir = await mkdtemp(path.join(tmpdir(), 'irrx-pdb-'))
  Object.assign(process.env, {
    PEERINGDB_URL: BASE,
    PEERINGDB_API_KEY: 'abc.def',
    PEERINGDB_REQUEST_GAP_MS: '0',
    BULK_CACHE_DIR: cacheDir,
    BULK_DATASETS_ENABLED: 'false',
  })
  resetEnv()
  resetPeeringDb()
  calls = []
  delta = {}
  status = 200
})
afterEach(async () => {
  server.resetHandlers()
  delete process.env.PEERINGDB_URL
  delete process.env.PEERINGDB_API_KEY
  delete process.env.PEERINGDB_REQUEST_GAP_MS
  delete process.env.BULK_CACHE_DIR
  delete process.env.PEERINGDB_FULL_SYNC_SECONDS
  resetEnv()
  resetPeeringDb()
  await rm(cacheDir, { recursive: true, force: true })
})
afterAll(() => server.close())

async function sync() {
  const db = await loadPeeringDb()
  peeringdb.set(db)
  return db
}

describe('PeeringDB sync', () => {
  it('downloads every object type once, with the API key', async () => {
    const db = await sync()
    expect(calls.map((c) => c.type)).toEqual(PDB_TYPES)
    expect(calls.every((c) => c.since === null && c.auth === 'Api-Key abc.def')).toBe(true)
    expect(db.tables.net.size).toBe(3)
    expect(await readdir(cacheDir)).toEqual(['peeringdb.json'])
  })

  it('keeps only contacts PeeringDB shows publicly', async () => {
    await sync()
    expect(pdbNetwork(3333)?.contacts).toEqual([])
    const kpn = pdbNetwork(1136)!
    expect(kpn.contacts.map((c) => c.role)).toEqual(['NOC', 'Technical', 'Technical'])
    expect(JSON.stringify(kpn)).not.toContain('redacted@example.net')
  })

  it('joins a network to its organisation, exchanges and facilities', async () => {
    await sync()
    const ripe = pdbNetwork(3333)!
    expect(ripe).toMatchObject({ name: 'RIPE NCC', irrAsSet: 'AS-RIPENCC', prefixes4: 30 })
    expect(ripe.org?.name).toBeTruthy()
    expect(ripe.exchanges.map((x) => [x.ix, x.ipv4, x.speed])).toEqual([
      ['AMS-IX', '80.249.208.68', 10000],
      ['AMS-IX', '80.249.208.71', 10000],
      ['NL-ix: Main', '193.239.117.25', 10000],
      ['NL-ix: Main', '193.239.118.84', 10000],
    ])
    const google = pdbNetwork(15169)!
    expect(google.facilities.length).toBeGreaterThan(0)
    expect(google.facilities[0]).toMatchObject({ localAsn: null })
    expect(pdbName(15169)).toBe('Google LLC')
    expect(pdbNetwork(64496)).toBeNull()
  })

  it('finds peering LANs and the port behind an exchange address', async () => {
    await sync()
    const lan = pdbPrefixInfo(parsePrefix('80.249.208.0/21')!)!
    expect(lan.lans).toEqual([
      expect.objectContaining({ ix: 'AMS-IX', prefix: '80.249.208.0/21', inDfz: true }),
    ])
    expect(lan.ports).toEqual([])
    const host = pdbPrefixInfo(parsePrefix('80.249.208.68/32')!)!
    expect(host.ports.map((p) => [p.net.asn, p.ix, p.routeServer])).toEqual([
      [3333, 'AMS-IX', true],
    ])
    const v6 = pdbPrefixInfo(parsePrefix('2001:7f8:1:0:0:a500:3333:1/128')!)!
    expect(v6.ports[0]?.net.asn).toBe(3333)
    expect(pdbPrefixInfo(parsePrefix('193.0.0.0/21')!)).toEqual({ lans: [], ports: [] })
  })

  it('indexes the AS-sets networks name', async () => {
    await sync()
    expect(pdbSetUsers('as-ripencc')).toEqual([{ id: 5104, asn: 3333, name: 'RIPE NCC' }])
    expect(pdbSetUsers('AS1136:AS-KPNNL')?.[0]?.asn).toBe(1136)
    expect(pdbSetUsers('AS-NOBODY')).toEqual([])
  })

  it('then fetches only changes, applying updates and deletions', async () => {
    const first = await sync()
    calls = []
    const port = pdbFixtureRows('netixlan').find(
      (r) => (r as { ipaddr4: string }).ipaddr4 === '80.249.208.71',
    ) as Record<string, unknown>
    const net = pdbFixtureRows('net').find((r) => (r as { asn: number }).asn === 3333) as Record<
      string,
      unknown
    >
    delta = {
      netixlan: [{ ...port, status: 'deleted' }],
      net: [{ ...net, name: 'RIPE NCC (renamed)' }],
    }
    const db = await sync()
    expect(calls.every((c) => c.since === String(first.syncedAt - 600))).toBe(true)
    expect(db.fullAt).toBe(first.fullAt)
    expect(pdbNetwork(3333)?.name).toBe('RIPE NCC (renamed)')
    expect(pdbNetwork(3333)?.exchanges).toHaveLength(3)
    // The earlier copy is untouched, so a request in flight keeps a consistent view.
    expect(first.tables.netixlan.size).toBe(db.tables.netixlan.size + 1)
  })

  it('resumes from the cache after a restart', async () => {
    await sync()
    resetPeeringDb()
    calls = []
    await sync()
    expect(calls.every((c) => c.since !== null)).toBe(true)
    expect(pdbNetwork(3333)?.name).toBe('RIPE NCC')
  })

  it('downloads everything again once the full copy is a day old', async () => {
    await sync()
    process.env.PEERINGDB_FULL_SYNC_SECONDS = '3600'
    resetEnv()
    // Pretend the last full download was two hours ago.
    const db = peeringdb.get()!
    db.fullAt -= 7200
    calls = []
    await sync()
    expect(calls.every((c) => c.since === null)).toBe(true)
  })

  it('keeps serving a cached copy when PeeringDB is down', async () => {
    await sync()
    resetPeeringDb()
    status = 503
    await expect(loadPeeringDb()).rejects.toThrow('HTTP 503 from PeeringDB')
    expect(pdbNetwork(3333)?.name).toBe('RIPE NCC')
  })

  it('explains a rejected key and a rate limit', async () => {
    status = 401
    await expect(loadPeeringDb()).rejects.toThrow('PeeringDB rejected the API key (HTTP 401)')
    status = 429
    await expect(loadPeeringDb()).rejects.toThrow('PeeringDB query limit reached (HTTP 429)')
    expect(peeringdbAvailability()).toBe('disabled')
  })

  it('works without a key', async () => {
    delete process.env.PEERINGDB_API_KEY
    resetEnv()
    await sync()
    expect(calls.every((c) => c.auth === null)).toBe(true)
  })
})
