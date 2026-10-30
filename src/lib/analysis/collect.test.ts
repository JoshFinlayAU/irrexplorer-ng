import { describe, expect, it } from 'vitest'
import { collect, pickRir } from './collect'
import { validateOrigin } from './rpki'
import { parsePrefix } from '../ip'

describe('collect', () => {
  it('groups rows per canonical prefix and validates origins', () => {
    const roas = [{ prefix: '193.0.0.0/21', asn: 3333, maxLength: 21 }]
    const rows = collect({
      bgp: [
        { prefix: '193.0.0.0/21', asn: 3333 },
        { prefix: '193.0.0.0/21', asn: 3333 },
      ],
      roas,
      irr: [
        { prefix: '193.0.0.0/21', asn: 3333, source: 'RIPE', rpslPk: '193.0.0.0/21AS3333' },
        { prefix: '193.0.0.0/22', asn: 3333, source: 'RADB', rpslPk: '193.0.0.0/22AS3333' },
      ],
      rir: [{ prefix: '193.0.0.0/8', rir: 'RIPE NCC' }],
      validate: (p, asn) =>
        validateOrigin(
          p.length,
          asn,
          roas.map((r) => ({ asn: r.asn, maxLength: r.maxLength })),
        ),
    })
    expect(rows.map((r) => r.prefix)).toEqual(['193.0.0.0/21', '193.0.0.0/22'])
    expect(rows[0]!.bgpOrigins).toEqual([{ asn: 3333, rpki: { state: 'valid' } }])
    expect(rows[0]!.rir).toBe('RIPE NCC')
    expect(rows[0]!.messages[0]!.text).toBe('Everything looks good')
    expect(rows[1]!.irrRoutes['RADB']![0]!.rpki).toEqual({ state: 'invalid', reason: 'length' })
  })

  it('marks RPKI unknown when the validator is unavailable', () => {
    const rows = collect({
      bgp: [{ prefix: '193.0.0.0/21', asn: 3333 }],
      roas: null,
      irr: [{ prefix: '193.0.0.0/21', asn: 3333, source: 'RIPE', rpslPk: 'x' }],
      rir: null,
      validate: null,
    })
    expect(rows[0]!.bgpOrigins[0]!.rpki.state).toBe('unknown')
    expect(rows[0]!.irrRoutes['RIPE']![0]!.rpki.state).toBe('unknown')
    expect(rows[0]!.rir).toBeNull()
  })
})

describe('pickRir', () => {
  const r = (prefix: string, rir: 'ARIN' | 'Registro.BR' | 'LACNIC') => ({
    prefix: parsePrefix(prefix)!,
    rir,
  })
  it('prefers a NIR', () => {
    expect(
      pickRir(parsePrefix('200.0.0.0/16')!, [
        r('200.0.0.0/8', 'LACNIC'),
        r('200.0.0.0/16', 'Registro.BR'),
      ]),
    ).toBe('Registro.BR')
  })
  it('prefers the most specific covering entry', () => {
    expect(
      pickRir(parsePrefix('8.8.8.0/24')!, [r('8.0.0.0/8', 'LACNIC'), r('8.8.0.0/16', 'ARIN')]),
    ).toBe('ARIN')
  })
  it('falls back to a contained entry', () => {
    expect(pickRir(parsePrefix('8.0.0.0/8')!, [r('8.8.0.0/16', 'ARIN')])).toBe('ARIN')
    expect(pickRir(parsePrefix('9.0.0.0/8')!, [r('8.8.0.0/16', 'ARIN')])).toBeNull()
  })
})
