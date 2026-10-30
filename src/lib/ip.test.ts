import { describe, expect, it } from 'vitest'
import {
  compareCidr,
  coveringPrefixes,
  covers,
  formatIp,
  parseIp,
  parsePrefix,
  prefixSortKey,
} from './ip'

describe('parsePrefix', () => {
  it.each([
    ['192.0.2.0/24', '192.0.2.0/24'],
    ['192.0.2.77/24', '192.0.2.0/24'],
    ['10.0.0.1', '10.0.0.1/32'],
    ['0.0.0.0/0', '0.0.0.0/0'],
    ['255.255.255.255/32', '255.255.255.255/32'],
    ['2001:DB8::/32', '2001:db8::/32'],
    ['2001:0db8:0000:0000:0000:0000:0000:0001/48', '2001:db8::/48'],
    ['2001:db8::1', '2001:db8::1/128'],
    ['::/0', '::/0'],
    ['::1', '::1/128'],
    ['2001:db8:0:0:1:0:0:1/128', '2001:db8::1:0:0:1/128'],
    ['2001:db8:0:1:1:1:1:1/128', '2001:db8:0:1:1:1:1:1/128'],
    ['::ffff:192.0.2.1/128', '::ffff:c000:201/128'],
    ['fe80::/10', 'fe80::/10'],
    [' 192.0.2.0/24 ', '192.0.2.0/24'],
  ])('%s -> %s', (input, expected) => {
    expect(parsePrefix(input)?.cidr).toBe(expected)
  })

  it.each([
    '192.0.2.0/33',
    '256.0.0.0/8',
    '1.2.3/24',
    '1.2.3.4.5',
    '2001:db8::/129',
    '2001:db8:::1',
    '1::2::3',
    '1:2:3:4:5:6:7:8:9',
    'abc',
    '',
    '192.0.2.0/',
    '192.0.2.0/-1',
    '01.2.3.4.5',
    '::ffff:1.2.3/128',
    '1:2:3:4:5:6:7:8::',
  ])('rejects %s', (input) => {
    expect(parsePrefix(input)).toBeNull()
  })
})

describe('parseIp/formatIp round trip', () => {
  it('formats v6 per RFC 5952 (first longest zero run)', () => {
    const ip = parseIp('2001:db8:0:0:1:0:0:1')!
    expect(formatIp(ip.version, ip.value)).toBe('2001:db8::1:0:0:1')
    const ip2 = parseIp('2001:0:0:1:0:0:0:1')!
    expect(formatIp(ip2.version, ip2.value)).toBe('2001:0:0:1::1')
  })
})

describe('covers', () => {
  const p = (s: string) => parsePrefix(s)!
  it('handles containment', () => {
    expect(covers(p('10.0.0.0/8'), p('10.1.0.0/16'))).toBe(true)
    expect(covers(p('10.0.0.0/8'), p('10.0.0.0/8'))).toBe(true)
    expect(covers(p('10.1.0.0/16'), p('10.0.0.0/8'))).toBe(false)
    expect(covers(p('10.0.0.0/8'), p('11.0.0.0/16'))).toBe(false)
    expect(covers(p('2001:db8::/32'), p('2001:db8:1::/48'))).toBe(true)
    expect(covers(p('0.0.0.0/0'), p('2001:db8::/32'))).toBe(false)
  })
  it('lists covering prefixes', () => {
    const list = coveringPrefixes(p('192.0.2.0/24'))
    expect(list).toHaveLength(25)
    expect(list[0]!.cidr).toBe('0.0.0.0/0')
    expect(list[23]!.cidr).toBe('192.0.2.0/23')
    expect(list[24]!.cidr).toBe('192.0.2.0/24')
  })
})

describe('ordering', () => {
  it('sorts by address not string', () => {
    const list = ['10.0.0.0/8', '9.0.0.0/8', '10.0.0.0/16', '2001::/16', '100.0.0.0/8']
    expect([...list].sort(compareCidr)).toEqual([
      '9.0.0.0/8',
      '10.0.0.0/8',
      '10.0.0.0/16',
      '100.0.0.0/8',
      '2001::/16',
    ])
  })
  it('sort keys order like comparePrefixes', () => {
    const a = parsePrefix('9.0.0.0/8')!
    const b = parsePrefix('10.0.0.0/8')!
    expect(prefixSortKey(a) < prefixSortKey(b)).toBe(true)
  })
})
