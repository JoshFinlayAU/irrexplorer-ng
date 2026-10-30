import { http, HttpResponse, delay } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { MOCK_BASE, recordedHandlers, useRecordedEnv } from '../recorded'
import { parsePrefix } from '~/lib/ip'
import { resetEnv } from '~/server/env'
import { clearCache } from '~/server/cache'
import { healthSnapshot, resetHealth } from '~/server/health'
import { UpstreamError } from '~/server/http'
import {
  memberOf,
  objectText,
  routesByOrigin,
  routesOverlapping,
  setLevel,
  databaseStatus,
} from '~/server/sources/irrd'
import { originatedByAsn, routingStatus, visibilityFrom } from '~/server/sources/ripestat'

const server = setupServer(...recordedHandlers)

beforeAll(() => {
  useRecordedEnv()
  resetEnv()
  server.listen({ onUnhandledFrame: 'error' })
})
beforeEach(() => {
  clearCache()
  resetHealth()
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const P = (s: string) => parsePrefix(s)!

describe('irrd', () => {
  it('finds overlapping route objects and splits out the RPKI pseudo-source', async () => {
    const { irr: rows, roas } = await routesOverlapping([P('193.0.0.0/21')])
    expect(roas).toContainEqual({ prefix: '193.0.0.0/21', asn: 3333, maxLength: 21 })
    expect(rows).toContainEqual({
      prefix: '193.0.0.0/21',
      asn: 3333,
      source: 'RIPE',
      rpslPk: '193.0.0.0/21AS3333',
    })
    expect(rows.some((r) => r.source === 'RPKI')).toBe(false)
    expect(healthSnapshot().irrd.lastSuccess).not.toBeNull()
  })

  it('looks up objects by origin', async () => {
    const { irr: rows } = await routesByOrigin(3333)
    expect(rows.map((r) => r.prefix)).toContain('193.0.0.0/21')
  })

  it('expands one set level', async () => {
    const level = await setLevel(['AS-RIPENCC'])
    expect(level[0]).toMatchObject({ name: 'AS-RIPENCC', source: 'RIPE' })
    expect(level[0]!.members).toContain('AS3333')
  })

  it('finds sets an ASN belongs to', async () => {
    const rows = await memberOf('AS3333', 'as-set')
    expect(rows).toContainEqual({ name: 'AS-RIPENCC', source: 'RIPE' })
  })

  it('fetches object text', async () => {
    const text = await objectText('193.0.0.0/21AS3333', 'RIPE', 'route')
    expect(text).toMatch(/^route:\s+193\.0\.0\.0\/21/m)
  })

  it('reads database status', async () => {
    const status = await databaseStatus()
    expect(status.map((s) => s.source)).toEqual(expect.arrayContaining(['RIPE', 'RADB']))
  })

  it('splits a timed-out batch once and retries the halves', async () => {
    process.env.IRRD_BULK_TIMEOUT_MS = '1000'
    resetEnv()
    let calls = 0
    let maxFast = 2
    server.use(
      http.post(`${MOCK_BASE}/irrd/graphql/`, async ({ request }) => {
        calls++
        const body = (await request.json()) as { variables: Record<string, string> }
        const vars = Object.entries(body.variables)
        // Batches of more than two prefixes "hang"; smaller ones answer.
        if (vars.length > maxFast) {
          await delay(5_000)
          return HttpResponse.json({ data: {} })
        }
        const data: Record<string, unknown> = {}
        vars.forEach(([, cidr], j) => {
          // The same covering object comes back for every query prefix.
          data[`q${j}`] = [
            { rpslPk: `${cidr}AS1`, source: 'RADB', prefix: cidr, asn: 1 },
            { rpslPk: '0.0.0.0/0AS1', source: 'RADB', prefix: '0.0.0.0/0', asn: 1 },
          ]
        })
        return HttpResponse.json({ data })
      }),
    )
    const { irr: rows } = await routesOverlapping([
      P('192.0.2.0/24'),
      P('198.51.100.0/24'),
      P('203.0.113.0/24'),
    ])
    // Covering objects are de-duplicated across query prefixes.
    expect(rows.map((r) => r.prefix).sort()).toEqual([
      '0.0.0.0/0',
      '192.0.2.0/24',
      '198.51.100.0/24',
      '203.0.113.0/24',
    ])
    // One batch of 3 timed out, then halves of 2 and 1 answered.
    expect(calls).toBe(3)

    // Only one split: if a half also times out, the lookup fails.
    maxFast = 0
    calls = 0
    clearCache()
    await expect(
      routesOverlapping([P('192.0.2.0/25'), P('198.51.100.0/25'), P('203.0.113.0/25')]),
    ).rejects.toThrow(/timed out/)
    expect(calls).toBe(3)
    delete process.env.IRRD_BULK_TIMEOUT_MS
    resetEnv()
  }, 20_000)

  it('turns GraphQL errors into UpstreamError', async () => {
    server.use(
      http.post(`${MOCK_BASE}/irrd/graphql/`, () =>
        HttpResponse.json({ errors: [{ message: 'boom' }] }),
      ),
    )
    await expect(routesByOrigin(64500)).rejects.toThrow(/GraphQL error: boom/)
    expect(healthSnapshot().irrd.lastError).toMatch(/boom/)
  })

  it('reports HTTP failures', async () => {
    server.use(
      http.post(`${MOCK_BASE}/irrd/graphql/`, () => new HttpResponse('nope', { status: 502 })),
    )
    await expect(routesByOrigin(64501)).rejects.toBeInstanceOf(UpstreamError)
    await expect(routesByOrigin(64501)).rejects.toThrow('HTTP 502')
  })

  it('reports unexpected response shapes', async () => {
    server.use(
      http.post(`${MOCK_BASE}/irrd/graphql/`, () =>
        HttpResponse.json({ data: { r: [{ wrong: true }] } }),
      ),
    )
    await expect(routesByOrigin(64502)).rejects.toThrow()
  })

  it('times out slow upstreams', async () => {
    server.use(
      http.post(`${MOCK_BASE}/irrd/graphql/`, async () => {
        await delay(20_000)
        return HttpResponse.json({ data: {} })
      }),
    )
    process.env.UPSTREAM_TIMEOUT_MS = '500'
    resetEnv()
    // IRRd calls use max(UPSTREAM_TIMEOUT_MS, 15s), so test the RIPEstat path for the short timeout.
    server.use(
      http.get(`${MOCK_BASE}/ripestat/*`, async () => {
        await delay(5_000)
        return HttpResponse.json({})
      }),
    )
    await expect(routingStatus(P('192.0.2.0/24'))).rejects.toThrow(/timed out after 0.5s/)
    process.env.UPSTREAM_TIMEOUT_MS = '1000'
    resetEnv()
  }, 10_000)
})

describe('ripestat', () => {
  it('reads routing status and visibility', async () => {
    const rs = await routingStatus(P('193.0.0.0/21'))
    expect(rs.origins.map((o) => Number(o.origin))).toContain(3333)
    const v = visibilityFrom(P('193.0.0.0/21'), rs)
    expect(v?.seeing).toBeGreaterThan(0)
    expect(v!.total).toBeGreaterThanOrEqual(v!.seeing)
  })

  it('lists originated prefixes', async () => {
    const rows = await originatedByAsn(3333)
    expect(rows.map((r) => r.prefix)).toContain('193.0.0.0/21')
  })

  it('rejects partial data calls', async () => {
    server.use(
      http.get(`${MOCK_BASE}/ripestat/*`, () =>
        HttpResponse.json({ status: 'ok', data_call_status: 'maintenance', data: {} }),
      ),
    )
    await expect(routingStatus(P('192.0.2.0/24'))).rejects.toThrow(/maintenance/)
  })

  it('rejects error status and error messages', async () => {
    server.use(
      http.get(`${MOCK_BASE}/ripestat/*`, () => HttpResponse.json({ status: 'error', data: {} })),
    )
    await expect(routingStatus(P('192.0.2.0/24'))).rejects.toThrow(/status error/)
    server.use(
      http.get(`${MOCK_BASE}/ripestat/*`, () =>
        HttpResponse.json({ status: 'ok', messages: [['error', 'bad resource']], data: {} }),
      ),
    )
    await expect(routingStatus(P('192.0.2.0/25'))).rejects.toThrow(/bad resource/)
  })

  it('keeps a base path in RIPESTAT_URL', async () => {
    let seen = ''
    server.use(
      http.get(`${MOCK_BASE}/ripestat/*`, ({ request }) => {
        seen = new URL(request.url).pathname
        return HttpResponse.json({ status: 'ok', data: { resource: '192.0.2.0/26' } })
      }),
    )
    await routingStatus(P('192.0.2.0/26'))
    expect(seen).toBe('/ripestat/data/routing-status/data.json')
  })
})

describe('upstream concurrency', () => {
  it('never runs more IRRd calls at once than allowed', async () => {
    process.env.IRRD_MAX_CONCURRENCY = '2'
    resetEnv()
    let inFlight = 0
    let peak = 0
    server.use(
      http.post(`${MOCK_BASE}/irrd/graphql/`, async () => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await delay(50)
        inFlight--
        return HttpResponse.json({ data: { r: [] } })
      }),
    )
    await Promise.all(Array.from({ length: 8 }, (_, i) => routesByOrigin(65000 + i)))
    expect(peak).toBe(2)
    delete process.env.IRRD_MAX_CONCURRENCY
    resetEnv()
  })
})
