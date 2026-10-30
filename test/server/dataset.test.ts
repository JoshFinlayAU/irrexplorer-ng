import { mkdtempSync, readFileSync, existsSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Dataset, fetchLines } from '~/server/dataset'
import { resetEnv } from '~/server/env'
import { healthSnapshot, resetHealth } from '~/server/health'

let hits = 0
const server = setupServer(
  http.get('http://bulk.test/data.txt', () => {
    hits++
    return new HttpResponse('a\r\nb\nc', { headers: { 'content-type': 'text/plain' } })
  }),
)
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => {
  delete process.env.BULK_CACHE_DIR
  resetEnv()
})
afterAll(() => server.close())

async function collect(cache?: { name: string; maxAgeSeconds: number }) {
  const lines: string[] = []
  await fetchLines('http://bulk.test/data.txt', { timeoutMs: 1000, cache }, (l) => lines.push(l))
  return lines
}

describe('fetchLines', () => {
  it('splits lines and strips carriage returns', async () => {
    expect(await collect()).toEqual(['a', 'b', 'c'])
  })

  it('reuses a fresh disk copy instead of downloading again', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'irrx-cache-'))
    process.env.BULK_CACHE_DIR = dir
    resetEnv()
    hits = 0
    await collect({ name: 'x', maxAgeSeconds: 60 })
    expect(readFileSync(path.join(dir, 'x.txt'), 'utf8')).toBe('a\r\nb\nc')
    expect(await collect({ name: 'x', maxAgeSeconds: 60 })).toEqual(['a', 'b', 'c'])
    expect(hits).toBe(1)
  })

  it('still loads when the cache directory is not writable', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'irrx-ro-'))
    chmodSync(dir, 0o500)
    process.env.BULK_CACHE_DIR = path.join(dir, 'sub')
    resetEnv()
    expect(await collect({ name: 'y', maxAgeSeconds: 60 })).toEqual(['a', 'b', 'c'])
    expect(existsSync(path.join(dir, 'sub', 'y.txt'))).toBe(false)
  })
})

describe('Dataset', () => {
  it('records success, keeps data and reports status', async () => {
    resetHealth()
    const ds = new Dataset<number[]>({
      name: 't',
      source: 'bgptools',
      refreshSeconds: 3600,
      retrySeconds: 3600,
      enabled: () => true,
      load: () => Promise.resolve([1, 2, 3]),
      size: (d) => d.length,
    })
    expect(await ds.ready(1000)).toEqual([1, 2, 3])
    expect(ds.status()).toMatchObject({ name: 't', size: 3, lastError: null, loading: false })
    expect(healthSnapshot().bgptools.lastSuccess).not.toBeNull()
  })

  it('records failure and serves nothing until a load succeeds', async () => {
    resetHealth()
    const ds = new Dataset<number[]>({
      name: 'f',
      source: 'rpki',
      refreshSeconds: 3600,
      retrySeconds: 3600,
      enabled: () => true,
      load: () => Promise.reject(new Error('down')),
    })
    expect(await ds.ready(1000)).toBeNull()
    expect(ds.status().lastError).toBe('down')
    expect(healthSnapshot().rpki.lastError).toBe('down')
  })

  it('does nothing when disabled', () => {
    const ds = new Dataset<number>({
      name: 'd',
      source: 'rpki',
      refreshSeconds: 1,
      retrySeconds: 1,
      enabled: () => false,
      load: () => Promise.reject(new Error('should not load')),
    })
    expect(ds.get()).toBeNull()
    expect(ds.status().loading).toBe(false)
  })
})
