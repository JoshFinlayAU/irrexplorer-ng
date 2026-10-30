import { describe, expect, it } from 'vitest'
import { parsePrefix } from './ip'
import { PrefixIndex } from './prefix-index'

const rows: [string, number][] = [
  ['10.0.0.0/8', 1],
  ['10.0.0.0/16', 2],
  ['10.0.0.0/16', 3],
  ['10.1.0.0/16', 2],
  ['10.255.255.0/24', 4],
  ['11.0.0.0/8', 5],
  ['9.0.0.0/8', 6],
  ['0.0.0.0/0', 7],
  ['2001:db8::/32', 8],
  ['2001:db8:ffff::/48', 9],
  ['2001:db9::/32', 10],
]
const index = PrefixIndex.build(
  rows.map(([p, value]) => ({ prefix: parsePrefix(p)!, value })),
  { indexByValue: (v) => v },
)
const show = (list: { prefix: { cidr: string }; value: number }[]) =>
  list.map((r) => `${r.prefix.cidr}=${r.value}`)
const P = (s: string) => parsePrefix(s)!

describe('PrefixIndex', () => {
  it('finds exact matches with all values', () => {
    expect(show(index.exact(P('10.0.0.0/16')))).toEqual(['10.0.0.0/16=2', '10.0.0.0/16=3'])
    expect(index.exact(P('10.0.0.0/24'))).toEqual([])
  })
  it('finds more specifics including exact', () => {
    expect(show(index.moreSpecific(P('10.0.0.0/8')))).toEqual([
      '10.0.0.0/8=1',
      '10.0.0.0/16=2',
      '10.0.0.0/16=3',
      '10.1.0.0/16=2',
      '10.255.255.0/24=4',
    ])
    expect(show(index.moreSpecific(P('10.0.0.0/8'), false))).not.toContain('10.0.0.0/8=1')
    expect(show(index.moreSpecific(P('2001:db8::/32')))).toEqual([
      '2001:db8::/32=8',
      '2001:db8:ffff::/48=9',
    ])
  })
  it('finds less specifics', () => {
    expect(show(index.lessSpecific(P('10.0.0.0/16')))).toEqual(['0.0.0.0/0=7', '10.0.0.0/8=1'])
  })
  it('finds overlaps', () => {
    expect(show(index.overlapping(P('10.1.2.0/24')))).toEqual([
      '0.0.0.0/0=7',
      '10.0.0.0/8=1',
      '10.1.0.0/16=2',
    ])
  })
  it('looks up by value key', () => {
    expect(show(index.withValueKey(2))).toEqual(['10.0.0.0/16=2', '10.1.0.0/16=2'])
  })
})
