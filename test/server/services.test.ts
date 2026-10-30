import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fixtureText, MOCK_BASE, recordedHandlers, useRecordedEnv } from '../recorded'
import { PrefixIndexBuilder } from '~/lib/prefix-index'
import { resetEnv } from '~/server/env'
import { clearCache } from '~/server/cache'
import { asNames, bgpTable, parseTableLine } from '~/server/sources/bgptools'
import { parseVrpLine, vrps } from '~/server/sources/rpki'
import { parseDelegatedLine, rirStats } from '~/server/sources/rirstats'
import { prefixReport } from '~/server/services/prefix'
import { asnReport } from '~/server/services/asn'
import { memberOfReport, setExpansion } from '~/server/services/sets'
import { statusReport } from '~/server/services/status'

const server = setupServer(...recordedHandlers)

function loadDatasets() {
  const table = new PrefixIndexBuilder()
  for (const line of fixtureText('bgptools/table.jsonl').split('\n')) {
    const row = parseTableLine(line, 20)
    if (row) table.add(row.prefix, row.asn)
  }
  bgpTable.set(table.build({ indexByValue: (v) => v }))
  asNames.set(
    new Map([[3333, 'RIPE-NCC-AS Reseaux IP Europeens Network Coordination Centre (RIPE NCC)']]),
  )
  const roa = new PrefixIndexBuilder()
  for (const line of fixtureText('rpki/vrps.csv').split('\n')) {
    const row = parseVrpLine(line)
    if (row) roa.add(row.prefix, row.value)
  }
  vrps.set(roa.build({ indexByValue: (v) => Math.floor(v / 256) }))
  const rir = new PrefixIndexBuilder()
  for (const line of fixtureText('rirstats/nro-delegated-stats.txt').split('\n')) {
    for (const r of parseDelegatedLine(line)) rir.add(r.prefix, r.value)
  }
  rirStats.set(rir.build())
}

beforeAll(() => {
  useRecordedEnv()
  process.env.SET_SIZE_LIMIT = '50'
  resetEnv()
  server.listen({ onUnhandledFrame: 'error' })
})
beforeEach(() => {
  clearCache()
  loadDatasets()
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('prefix report', () => {
  it('193.0.0.0/21 is all good with every source present', async () => {
    const r = await prefixReport('193.0.0.0/21')
    expect(r.notices).toEqual([])
    const row = r.overlaps.find((x) => x.prefix === '193.0.0.0/21')!
    expect(row).toMatchObject({
      rir: 'RIPE NCC',
      bgpOrigins: [{ asn: 3333, rpki: { state: 'valid' } }],
      rpkiRoutes: [{ asn: 3333, maxLength: 21 }],
      categoryOverall: 'success',
    })
    expect(row.irrRoutes['RIPE']).toEqual([
      { asn: 3333, rpslPk: '193.0.0.0/21AS3333', rpki: { state: 'valid' } },
    ])
    expect(r.visibility?.seeing).toBeGreaterThan(0)
    expect(r.asNames['3333']).toMatch(/RIPE NCC/)
  })

  it('bare IP resolves the covering announced prefix', async () => {
    const r = await prefixReport('193.0.0.1/32')
    expect(r.isHost).toBe(true)
    expect(r.query).toBe('193.0.0.1')
    expect(r.coveringAnnounced).toBe('193.0.0.0/21')
    expect(r.leastSpecific?.prefix).toBeDefined()
  })

  it('refuses too-large queries without calling upstreams', async () => {
    server.use(http.post(`${MOCK_BASE}/irrd/graphql/`, () => HttpResponse.error()))
    const r = await prefixReport('8.0.0.0/8')
    expect(r.tooLarge).toBe(true)
    expect(r.overlaps).toEqual([])
  })

  it('renders partially when IRRd is down', async () => {
    server.use(
      http.post(`${MOCK_BASE}/irrd/graphql/`, () => new HttpResponse('down', { status: 503 })),
    )
    const r = await prefixReport('193.0.0.0/21')
    expect(r.sources.irr.status).toBe('unavailable')
    expect(r.notices.map((n) => n.text).join(' ')).toMatch(/IRRd unavailable: HTTP 503/)
    const row = r.overlaps.find((x) => x.prefix === '193.0.0.0/21')!
    expect(row.messages.map((m) => m.text)).toEqual([
      'Some checks were skipped because IRR data is unavailable',
    ])
  })

  it('falls back to RIS when the bgp.tools table is not loaded', async () => {
    bgpTable.set(null)
    const r = await prefixReport('193.0.0.0/21')
    expect(r.sources.bgp.status).toBe('degraded')
    expect(
      r.overlaps.find((x) => x.prefix === '193.0.0.0/21')?.bgpOrigins.map((o) => o.asn),
    ).toEqual([3333])
  })

  it('marks RPKI unknown, not not-found, when VRPs are missing', async () => {
    vrps.set(null)
    const r = await prefixReport('193.0.0.0/21')
    const row = r.overlaps.find((x) => x.prefix === '193.0.0.0/21')!
    expect(row.bgpOrigins[0]!.rpki.state).toBe('unknown')
    expect(row.irrRoutes['RIPE']![0]!.rpki.state).toBe('unknown')
    expect(r.sources.rpki.status).toBe('unavailable')
  })

  it('finds RPKI-invalid route objects', async () => {
    const r = await prefixReport('137.17.80.0/24')
    const row = r.overlaps.find((x) => x.prefix === '137.17.80.0/24')!
    expect(row.messages.map((m) => m.text)).toContain('RPKI-invalid route objects found')
  })
})

describe('asn report', () => {
  it('splits direct and overlapping prefixes', async () => {
    const r = await asnReport(3333)
    expect(r.name).toMatch(/RIPE NCC/)
    expect(r.directOrigin.map((x) => x.prefix)).toContain('193.0.0.0/21')
    for (const row of r.overlaps) {
      expect(row.bgpOrigins.some((o) => o.asn === 3333)).toBe(false)
    }
  })

  it('uses RIS for direct origins when the table is not loaded', async () => {
    bgpTable.set(null)
    const r = await asnReport(3333)
    expect(r.sources.bgp.status).toBe('degraded')
    expect(r.directOrigin.map((x) => x.prefix)).toContain('193.0.0.0/21')
  })
})

describe('sets and status', () => {
  it('expands sets and finds membership', async () => {
    const e = await setExpansion('AS-RIPENCC', 'as-set')
    expect(e.found).toBe(true)
    expect(e.sets['AS-RIPENCC|RIPE']?.members).toContain('AS3333')
    const m = await memberOfReport('AS3333', 'as-set')
    expect(m.setsPerIrr['RIPE']).toContain('AS-RIPENCC')
  })

  it('truncates at the configured limit', async () => {
    const e = await setExpansion('AS-COLOCLUE', 'as-set')
    expect(e.truncated).toBe(true)
    expect(e.limit).toBe(50)
  })

  it('reports dataset and upstream status', async () => {
    const s = await statusReport()
    expect(s.datasets.map((d) => d.name)).toEqual([
      'bgp.tools table',
      'bgp.tools AS names',
      'RPKI VRPs',
      'RIR delegations',
    ])
    expect(s.irr?.map((i) => i.source)).toContain('RIPE')
    expect(s.validator?.version).toMatch(/routinator/)
  })
})
