// JSON API compatible with the original IRR Explorer, plus /healthz.
import { expect, test } from './helpers'

test.describe.configure({ mode: 'parallel' })

test('healthz reports process and per-upstream state', async ({ request }) => {
  const res = await request.get('/healthz')
  expect(res.ok()).toBe(true)
  const body = (await res.json()) as {
    status: string
    upstreams: Record<string, unknown>
    datasets: unknown[]
  }
  expect(body.status).toBe('ok')
  expect(Object.keys(body.upstreams).sort()).toEqual([
    'bgptools',
    'irrd',
    'ripestat',
    'rirstats',
    'rpki',
  ])
  expect(body.datasets).toHaveLength(4)
})

test('clean_query classifies like the original', async ({ request }) => {
  const cases: [string, string, string][] = [
    ['as3333', 'asn', 'AS3333'],
    ['193.0.0.77/21', 'prefix', '193.0.0.0/21'],
    ['193.0.0.1', 'prefix', '193.0.0.1'],
    ['as-ripencc', 'as-set', 'AS-RIPENCC'],
    ['AS3333:RS-FOO', 'route-set', 'AS3333:RS-FOO'],
  ]
  for (const [input, category, cleanedValue] of cases) {
    const res = await request.get(`/api/clean_query/${input}`)
    expect(await res.json()).toEqual({ category, cleanedValue })
  }
  const bad = await request.get('/api/clean_query/hello%20world')
  expect(bad.status()).toBe(400)
  const large = await request.get('/api/clean_query/8.0.0.0/8')
  expect(large.status()).toBe(400)
  expect(await large.text()).toBe('Query too large: the minimum prefix length is 9.')
})

test('prefix summaries use the original field names', async ({ request }) => {
  const res = await request.get('/api/prefixes/prefix/193.0.0.0/21')
  const body = (await res.json()) as Record<string, unknown>[]
  const row = body.find((r) => r['prefix'] === '193.0.0.0/21')!
  expect(row).toMatchObject({
    rir: 'RIPE NCC',
    bgpOrigins: [3333],
    categoryOverall: 'success',
    goodnessOverall: 3,
    irrRoutes: { RIPE: [{ asn: 3333, rpkiStatus: 'VALID' }] },
    rpkiRoutes: [{ asn: 3333, rpkiMaxLength: 21 }],
  })
  expect(res.headers()['access-control-allow-origin']).toBe('*')
})

test('asn endpoint returns directOrigin and overlaps', async ({ request }) => {
  const body = (await (await request.get('/api/prefixes/asn/AS3333')).json()) as {
    directOrigin: { prefix: string }[]
    overlaps: unknown[]
  }
  expect(body.directOrigin.map((r) => r.prefix)).toContain('193.0.0.0/21')
  expect(Array.isArray(body.overlaps)).toBe(true)
})

test('member-of and expand endpoints', async ({ request }) => {
  const m = (await (await request.get('/api/sets/member-of/as-set/AS3333')).json()) as {
    irrsSeen: string[]
    setsPerIrr: Record<string, string[]>
  }
  expect(m.irrsSeen).toContain('RIPE')
  expect(m.setsPerIrr['RIPE']).toContain('AS-RIPENCC')
  const bad = await request.get('/api/sets/member-of/foo/AS3333')
  expect(bad.status()).toBe(404)
  const e = (await (await request.get('/api/sets/expand/AS-RIPENCC')).json()) as {
    name: string
    members: string[]
  }[]
  expect(e[0]).toMatchObject({ name: 'AS-RIPENCC', members: expect.arrayContaining(['AS3333']) })
})

test('metadata lists IRR sources', async ({ request }) => {
  const body = (await (await request.get('/api/metadata/')).json()) as {
    last_update: { irr: Record<string, string> }
  }
  expect(Object.keys(body.last_update.irr)).toContain('RIPE')
})
