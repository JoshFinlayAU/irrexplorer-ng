import { describe, expect, it } from 'vitest'
import { buildMessages, rate } from './report'
import type { IrrRoute, PrefixSummary, RirName, RpkiValidity } from './types'

type Row = Omit<PrefixSummary, 'messages' | 'categoryOverall' | 'goodnessOverall'>

const VALID: RpkiValidity = { state: 'valid' }
const NF: RpkiValidity = { state: 'not-found' }
const INV: RpkiValidity = { state: 'invalid', reason: 'as' }

function row(opts: {
  prefix?: string
  rir?: RirName | null
  bgp?: number[]
  roas?: [number, number][]
  irr?: Record<string, [number, RpkiValidity][]>
}): Row {
  const irrRoutes: Record<string, IrrRoute[]> = {}
  for (const [source, list] of Object.entries(opts.irr ?? {})) {
    irrRoutes[source] = list.map(([asn, rpki]) => ({ asn, rpki, rpslPk: `X${asn}` }))
  }
  return {
    prefix: opts.prefix ?? '193.0.0.0/21',
    rir: opts.rir === undefined ? 'RIPE NCC' : opts.rir,
    bgpOrigins: (opts.bgp ?? []).map((asn) => ({ asn, rpki: VALID })),
    rpkiRoutes: (opts.roas ?? []).map(([asn, maxLength]) => ({ asn, maxLength })),
    irrRoutes,
  }
}

const texts = (r: Row, ...a: Parameters<typeof buildMessages>[1][]) =>
  buildMessages(r, ...a).map((m) => `${m.category}: ${m.text}`)

describe('status messages (parity with original report.py)', () => {
  it('193.0.0.0/21 reference case is all good', () => {
    const r = rate(row({ bgp: [3333], roas: [[3333, 21]], irr: { RIPE: [[3333, VALID]] } }))
    expect(r.messages).toEqual([{ category: 'success', text: 'Everything looks good' }])
    expect(r.categoryOverall).toBe('success')
    expect(r.goodnessOverall).toBe(3)
  })

  it('8.8.8.0/24 reference case: only in other IRRs', () => {
    expect(
      texts(
        row({
          prefix: '8.8.8.0/24',
          rir: 'ARIN',
          bgp: [15169],
          roas: [[15169, 24]],
          irr: { RADB: [[15169, VALID]] },
        }),
      ),
    ).toEqual(['warning: Expected route object in ARIN, but only found in other IRRs'])
  })

  it('8.0.0.0/12 reference case: no route objects match', () => {
    expect(texts(row({ prefix: '8.0.0.0/12', rir: 'ARIN', bgp: [3356] }))).toEqual([
      'danger: No route objects match DFZ origin',
    ])
  })

  it('1: route objects but not in DFZ', () => {
    expect(texts(row({ irr: { RIPE: [[3333, VALID]] }, roas: [[3333, 21]] }))).toEqual([
      'info: Route objects exist, but prefix not seen in DFZ',
      'info: RPKI ROA exists, but prefix not seen in DFZ',
    ])
  })

  it('2: an AS0-only ROA does not count as "ROA exists"', () => {
    expect(texts(row({ roas: [[0, 21]] }))).toEqual(['success: Everything looks good'])
    expect(
      texts(
        row({
          roas: [
            [0, 21],
            [3333, 21],
          ],
        }),
      ),
    ).toContain('info: RPKI ROA exists, but prefix not seen in DFZ')
  })

  it('4: some DFZ origins have no route object', () => {
    expect(texts(row({ bgp: [1, 2], irr: { RIPE: [[1, NF]] } }))).toEqual([
      'danger: No route objects for some DFZ origins',
      'info: No (covering) RPKI ROA found for route objects',
    ])
  })

  it('6: expected IRR present but origin only matches elsewhere', () => {
    expect(texts(row({ bgp: [1], irr: { RIPE: [[2, VALID]], RADB: [[1, VALID]] } }))).toEqual([
      'danger: Expected route object in RIPE, but BGP origin does not match. Objects from other IRRs do match BGP origin',
    ])
  })

  it('7: expected matches, other IRRs have non-matching objects', () => {
    expect(texts(row({ bgp: [1], irr: { RIPE: [[1, VALID]], RADB: [[2, VALID]] } }))).toEqual([
      'warning: Expected route object in RIPE matches BGP origin, but non-matching objects exist in other IRRs',
    ])
  })

  it('8: multiple IRR origins, single DFZ origin (no RIR)', () => {
    expect(
      texts(
        row({
          rir: null,
          bgp: [1],
          irr: {
            RADB: [
              [1, VALID],
              [2, VALID],
            ],
          },
        }),
      ),
    ).toEqual([
      'warning: Multiple route objects exist with different origins, but DFZ only has one',
    ])
  })

  it('9: RPKI origin mismatch, including AS0 ROAs', () => {
    expect(texts(row({ bgp: [1], roas: [[2, 21]], irr: { RIPE: [[1, INV]] } }))).toEqual([
      'danger: RPKI origin does not match BGP origin',
      'danger: RPKI-invalid route objects found',
    ])
    expect(texts(row({ bgp: [1], roas: [[0, 21]], irr: { RIPE: [[1, INV]] } }))).toContain(
      'danger: RPKI origin does not match BGP origin',
    )
  })

  it('11: no covering ROA for route objects', () => {
    expect(texts(row({ bgp: [1], irr: { RIPE: [[1, NF]] } }))).toEqual([
      'info: No (covering) RPKI ROA found for route objects',
    ])
  })

  it('12: special use overlaps, both directions', () => {
    expect(texts(row({ prefix: '10.1.0.0/16', rir: null }))).toEqual([
      'danger: Overlaps with RFC1918 special use prefix 10.0.0.0/8',
    ])
    expect(texts(row({ prefix: '192.0.0.0/8', rir: null }))).toEqual([
      'danger: Overlaps with RFC5736 special use prefix 192.0.0.0/24',
      'danger: Overlaps with RFC1918 special use prefix 192.168.0.0/16',
      'danger: Overlaps with RFC5737 special use prefix 192.0.2.0/24',
    ])
    expect(texts(row({ prefix: 'fd00::/8', rir: null }))).toEqual([
      'danger: Overlaps with IPv6-ULA special use prefix fc00::/7',
    ])
  })

  it('sorts by severity keeping emission order', () => {
    const r = rate(row({ prefix: '10.0.0.0/24', rir: null, irr: { RADB: [[1, NF]] } }))
    expect(r.messages.map((m) => m.category)).toEqual(['danger', 'info', 'info'])
    expect(r.categoryOverall).toBe('danger')
    expect(r.goodnessOverall).toBe(0)
  })

  it('never says everything is good when a source is missing', () => {
    const msgs = texts(row({ bgp: [3333], irr: { RIPE: [[3333, VALID]] } }), {
      bgp: false,
      irr: true,
      rpki: true,
      rir: true,
    })
    expect(msgs).toEqual(['info: Some checks were skipped because BGP data is unavailable'])
  })

  it('skips RPKI checks when RPKI is unavailable', () => {
    const msgs = texts(row({ bgp: [1], irr: { RIPE: [[1, { state: 'unknown' }]] } }), {
      bgp: true,
      irr: true,
      rpki: false,
      rir: true,
    })
    expect(msgs).toEqual(['info: Some checks were skipped because RPKI data is unavailable'])
  })
})
