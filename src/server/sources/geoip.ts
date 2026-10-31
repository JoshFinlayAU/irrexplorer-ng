// MaxMind GeoLite2 geolocation, downloaded with the account's licence key and
// held in memory. The database is checked on a schedule with a HEAD request,
// which MaxMind does not count against the daily download limit, and only
// downloaded again when Last-Modified changes (GeoLite2 is rebuilt twice a
// week). https://dev.maxmind.com/geoip/updating-databases/
import '@tanstack/react-start/server-only'

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { gunzip } from 'node:zlib'
import { Reader, type CityResponse } from 'mmdb-lib'
import { z } from 'zod'
import { parsePrefix, type Prefix } from '~/lib/ip'
import { geoOfPrefix, type GeoLookup, type GeoOptions, type GeoRecord } from '~/lib/analysis/geo'
import type { GeoAvailability, PrefixGeo } from '~/lib/analysis/types'
import { singletonDataset } from '../dataset'
import { env } from '../env'

export interface GeoDatabase {
  edition: string
  /** When MaxMind built this copy (from the database metadata). */
  buildDate: string
  /** Last-Modified of the download, used to skip unchanged releases. */
  lastModified: string | null
  lookup: GeoLookup
}

const USER_AGENT = 'irrexplorer-ng (GeoLite2 updater)'

export function geoipConfigured(): boolean {
  const e = env()
  return Boolean(e.MAXMIND_ACCOUNT_ID && e.MAXMIND_LICENSE_KEY)
}

function downloadUrl(): string {
  const e = env()
  const base = e.MAXMIND_DOWNLOAD_URL.replace(/\/+$/, '')
  return `${base}/geoip/databases/${encodeURIComponent(e.GEOIP_EDITION)}/download?suffix=tar.gz`
}

function authHeaders(): Record<string, string> {
  const e = env()
  const token = Buffer.from(`${e.MAXMIND_ACCOUNT_ID}:${e.MAXMIND_LICENSE_KEY}`).toString('base64')
  // fetch drops Authorization when it follows the redirect to MaxMind's
  // storage host, which takes a presigned URL instead.
  return { authorization: `Basic ${token}`, 'user-agent': USER_AGENT }
}

function httpError(status: number): Error {
  if (status === 401) return new Error('MaxMind rejected the account ID or licence key (HTTP 401)')
  if (status === 429) return new Error('MaxMind daily download limit reached (HTTP 429)')
  return new Error(`HTTP ${status} from MaxMind`)
}

/** Extract the first .mmdb file from a tar archive (ustar, as MaxMind ships). */
export function mmdbFromTar(tar: Buffer): Buffer {
  let offset = 0
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every((b) => b === 0)) break
    const field = (start: number, len: number) =>
      header
        .subarray(start, start + len)
        .toString('utf8')
        .replace(/\0.*$/s, '')
    const prefix = field(345, 155)
    const name = prefix ? `${prefix}/${field(0, 100)}` : field(0, 100)
    const size = parseInt(field(124, 12).trim() || '0', 8)
    const type = field(156, 1)
    const body = offset + 512
    if ((type === '0' || type === '') && name.endsWith('.mmdb'))
      return Buffer.from(tar.subarray(body, body + size))
    offset = body + Math.ceil(size / 512) * 512
  }
  throw new Error('MaxMind download contained no .mmdb file')
}

const MetaSchema = z.object({ lastModified: z.string().nullable() })

function cachePaths(): { db: string; meta: string } | null {
  const dir = env().BULK_CACHE_DIR
  if (!dir) return null
  const base = path.join(dir, env().GEOIP_EDITION)
  return { db: `${base}.mmdb`, meta: `${base}.json` }
}

async function readCache(): Promise<{ buffer: Buffer; lastModified: string | null } | null> {
  const paths = cachePaths()
  if (!paths) return null
  try {
    const [buffer, meta] = await Promise.all([readFile(paths.db), readFile(paths.meta, 'utf8')])
    return { buffer, lastModified: MetaSchema.parse(JSON.parse(meta)).lastModified }
  } catch {
    return null
  }
}

async function writeCache(buffer: Buffer, lastModified: string | null): Promise<void> {
  const paths = cachePaths()
  if (!paths) return
  const tmp = `${paths.db}.${process.pid}.tmp`
  try {
    await mkdir(path.dirname(paths.db), { recursive: true })
    await writeFile(tmp, buffer)
    await rename(tmp, paths.db)
    await writeFile(paths.meta, JSON.stringify({ lastModified }))
  } catch (err) {
    console.warn(`[geoip] could not cache the database: ${String(err)}`)
    await rm(tmp, { force: true }).catch(() => undefined)
  }
}

function open(buffer: Buffer, lastModified: string | null): GeoDatabase {
  const reader = new Reader<CityResponse>(buffer)
  const type = reader.metadata.databaseType
  if (!/City|Country/.test(type)) throw new Error(`${type} is not a City or Country database`)
  return {
    edition: type,
    buildDate: reader.metadata.buildEpoch.toISOString(),
    lastModified,
    // GeoRecord is the optional-everything subset of CityResponse that is read.
    lookup: (ip) => reader.getWithPrefixLength(ip) as [GeoRecord | null, number],
  }
}

/** Last-Modified of the current release, without using a download. */
async function latestRelease(): Promise<string | null> {
  const res = await fetch(downloadUrl(), {
    method: 'HEAD',
    headers: authHeaders(),
    signal: AbortSignal.timeout(env().UPSTREAM_TIMEOUT_MS),
  })
  if (!res.ok) throw httpError(res.status)
  return res.headers.get('last-modified')
}

async function download(): Promise<{ buffer: Buffer; lastModified: string | null }> {
  const res = await fetch(downloadUrl(), {
    headers: authHeaders(),
    signal: AbortSignal.timeout(300_000),
  })
  if (!res.ok) throw httpError(res.status)
  const tar = await promisify(gunzip)(Buffer.from(await res.arrayBuffer()))
  return { buffer: mmdbFromTar(tar), lastModified: res.headers.get('last-modified') }
}

let current: GeoDatabase | null = null

/** Tests: forget the loaded copy so the next load starts cold. */
export function resetGeoip(): void {
  current = null
  geoip.set(null)
}

/**
 * Check for a new release and return the database to serve: the loaded one
 * if unchanged, else a cached or fresh download. Exported for tests.
 */
export async function loadGeoDatabase(): Promise<GeoDatabase> {
  let release: string | null
  try {
    release = await latestRelease()
  } catch (err) {
    // Keep serving what we have; with nothing loaded, a cached copy beats none.
    if (current) throw err
    const cached = await readCache()
    if (!cached) throw err
    console.warn(`[geoip] release check failed, using cached copy: ${String(err)}`)
    current = open(cached.buffer, cached.lastModified)
    return current
  }
  // Without Last-Modified there is nothing to compare, so keep what is loaded.
  if (current && (release === null || current.lastModified === release)) return current
  if (!current) {
    const cached = await readCache()
    if (cached && release && cached.lastModified === release) {
      current = open(cached.buffer, cached.lastModified)
      return current
    }
  }
  const fresh = await download()
  const db = open(fresh.buffer, fresh.lastModified ?? release)
  await writeCache(fresh.buffer, db.lastModified)
  current = db
  return db
}

export const geoip = singletonDataset<GeoDatabase>({
  name: 'MaxMind GeoLite2',
  source: 'maxmind',
  refreshSeconds: env().GEOIP_REFRESH_SECONDS,
  retrySeconds: 3600,
  enabled: () => env().BULK_DATASETS_ENABLED && geoipConfigured(),
  load: loadGeoDatabase,
  version: (db) => `${db.edition} built ${db.buildDate.slice(0, 10)}`,
})

/** Geolocation of a prefix, or null when GeoIP is not configured or loaded. */
export function geoFor(p: Prefix, options?: GeoOptions): PrefixGeo | null {
  const db = geoip.get()
  return db ? geoOfPrefix(p, db.lookup, options) : null
}

/**
 * Attach GeoLite2 data to each row. Rows get geo: null while it is configured
 * but not loaded, and no geo field at all when GeoIP is not configured, so the
 * UI can leave the column out.
 */
export function withGeo<T extends { prefix: string }>(
  rows: T[],
): (T & { geo?: PrefixGeo | null })[] {
  const db = geoip.get()
  if (!db && geoAvailability() === 'unconfigured') return rows
  return rows.map((r) => {
    const p = db ? parsePrefix(r.prefix) : null
    return { ...r, geo: db && p ? geoOfPrefix(p, db.lookup) : null }
  })
}

export function geoAvailability(): GeoAvailability {
  if (geoip.get()) return 'ok'
  return geoipConfigured() && env().BULK_DATASETS_ENABLED ? 'unavailable' : 'unconfigured'
}
