import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { gunzipSync } from 'node:zlib'
import { GEO_LAST_MODIFIED, geoFixtureTarball } from '../geo-fixture'
import { parsePrefix } from '~/lib/ip'
import { resetEnv } from '~/server/env'
import {
  geoAvailability,
  geoFor,
  geoip,
  loadGeoDatabase,
  mmdbFromTar,
  resetGeoip,
  withGeo,
} from '~/server/sources/geoip'

const BASE = 'http://maxmind.test'
const URL_PATH = `${BASE}/geoip/databases/GeoLite2-City/download`
const tarball = geoFixtureTarball()

let calls: { method: string; auth: string | null }[] = []
let lastModified = GEO_LAST_MODIFIED
const handler = ({ request }: { request: Request }) => {
  calls.push({ method: request.method, auth: request.headers.get('authorization') })
  if (request.headers.get('authorization') !== `Basic ${btoa('12345:secret')}`)
    return new HttpResponse('Invalid license key', { status: 401 })
  const headers = { 'last-modified': lastModified, 'content-type': 'application/gzip' }
  return request.method === 'HEAD'
    ? new HttpResponse(null, { headers })
    : new HttpResponse(tarball, { headers })
}
const server = setupServer(http.head(URL_PATH, handler), http.get(URL_PATH, handler))

let cacheDir = ''
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
beforeEach(async () => {
  cacheDir = await mkdtemp(path.join(tmpdir(), 'irrx-geo-'))
  Object.assign(process.env, {
    MAXMIND_ACCOUNT_ID: '12345',
    MAXMIND_LICENSE_KEY: 'secret',
    MAXMIND_DOWNLOAD_URL: BASE,
    BULK_CACHE_DIR: cacheDir,
    BULK_DATASETS_ENABLED: 'false',
  })
  resetEnv()
  resetGeoip()
  calls = []
  lastModified = GEO_LAST_MODIFIED
})
afterEach(async () => {
  server.resetHandlers()
  delete process.env.MAXMIND_ACCOUNT_ID
  delete process.env.MAXMIND_LICENSE_KEY
  delete process.env.MAXMIND_DOWNLOAD_URL
  delete process.env.BULK_CACHE_DIR
  resetEnv()
  resetGeoip()
  await rm(cacheDir, { recursive: true, force: true })
})
afterAll(() => server.close())

describe('GeoLite2 updates', () => {
  it('extracts the database from a MaxMind tarball', () => {
    const mmdb = mmdbFromTar(gunzipSync(tarball))
    expect(mmdb.subarray(mmdb.lastIndexOf('MaxMind.com') - 3).subarray(0, 3)).toEqual(
      Buffer.from([0xab, 0xcd, 0xef]),
    )
    expect(() => mmdbFromTar(Buffer.alloc(1024))).toThrow(/no \.mmdb/)
  })

  it('downloads once, then only checks with HEAD until a new release', async () => {
    const db = await loadGeoDatabase()
    expect(db).toMatchObject({ edition: 'GeoLite2-City', lastModified: GEO_LAST_MODIFIED })
    expect(db.buildDate.slice(0, 10)).toBe('2026-10-29')
    expect(calls.map((c) => c.method)).toEqual(['HEAD', 'GET'])
    expect(await readdir(cacheDir)).toEqual(['GeoLite2-City.json', 'GeoLite2-City.mmdb'])

    calls = []
    expect(await loadGeoDatabase()).toBe(db)
    expect(calls.map((c) => c.method)).toEqual(['HEAD'])

    calls = []
    lastModified = 'Tue, 03 Nov 2026 14:00:00 GMT'
    const next = await loadGeoDatabase()
    expect(next).not.toBe(db)
    expect(next.lastModified).toBe(lastModified)
    expect(calls.map((c) => c.method)).toEqual(['HEAD', 'GET'])
  })

  it('reuses the cached copy after a restart when the release is unchanged', async () => {
    await loadGeoDatabase()
    resetGeoip()
    calls = []
    await loadGeoDatabase()
    expect(calls.map((c) => c.method)).toEqual(['HEAD'])
  })

  it('falls back to the cached copy when MaxMind cannot be reached', async () => {
    await loadGeoDatabase()
    resetGeoip()
    server.use(http.head(URL_PATH, () => HttpResponse.error()))
    expect((await loadGeoDatabase()).edition).toBe('GeoLite2-City')
  })

  it('explains a rejected licence key', async () => {
    process.env.MAXMIND_LICENSE_KEY = 'wrong'
    resetEnv()
    await expect(loadGeoDatabase()).rejects.toThrow(/licence key \(HTTP 401\)/)
  })
})

describe('geo lookups', () => {
  it('reports unconfigured without a licence key', () => {
    delete process.env.MAXMIND_LICENSE_KEY
    resetEnv()
    expect(geoAvailability()).toBe('unconfigured')
    expect(geoFor(parsePrefix('193.0.0.0/21')!)).toBeNull()
  })

  it('annotates rows once loaded', async () => {
    geoip.set(await loadGeoDatabase())
    const [row] = withGeo([{ prefix: '193.0.0.0/21' }])
    expect(row!.geo?.countries.map((c) => c.code)).toEqual(['NL', 'DE'])
    expect(geoFor(parsePrefix('193.0.0.1/32')!, { place: true })?.place?.city).toBe('Amsterdam')
  })
})
