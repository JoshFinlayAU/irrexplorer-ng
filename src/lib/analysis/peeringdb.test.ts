import { describe, expect, it } from 'vitest'
import { maxPrefixState, parseIrrAsSet, speedText } from './peeringdb'

describe('parseIrrAsSet', () => {
  it('reads the forms networks use', () => {
    expect(parseIrrAsSet('AS-RIPENCC')).toEqual([{ source: null, name: 'AS-RIPENCC' }])
    expect(parseIrrAsSet('RIPE::AS1136:AS-KPNNL')).toEqual([
      { source: 'RIPE', name: 'AS1136:AS-KPNNL' },
    ])
    expect(parseIrrAsSet('RIPE::AS-RETN RIPE::AS-RETN6')).toHaveLength(2)
    expect(parseIrrAsSet('as-foo@radb, AS-BAR;AS-BAR')).toEqual([
      { source: 'RADB', name: 'AS-FOO' },
      { source: null, name: 'AS-BAR' },
    ])
    expect(parseIrrAsSet('AS3333')).toEqual([{ source: null, name: 'AS3333' }])
  })

  it('drops text that is not a set or ASN', () => {
    expect(parseIrrAsSet('')).toEqual([])
    expect(parseIrrAsSet('see website')).toEqual([])
  })
})

describe('speedText', () => {
  it('formats Mbit/s like PeeringDB does', () => {
    expect(speedText(100)).toBe('100M')
    expect(speedText(10000)).toBe('10G')
    expect(speedText(2400000)).toBe('2.4T')
    expect(speedText(1500)).toBe('1.5G')
  })
})

describe('maxPrefixState', () => {
  it('compares announcements with the PeeringDB value', () => {
    expect(maxPrefixState(5, null)).toBe('unset')
    expect(maxPrefixState(5, 0)).toBe('unset')
    expect(maxPrefixState(5, 30)).toBe('ok')
    expect(maxPrefixState(28, 30)).toBe('near')
    expect(maxPrefixState(31, 30)).toBe('over')
  })
})
