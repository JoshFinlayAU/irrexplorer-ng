import { describe, expect, it } from 'vitest'
import { parsePrefix } from '../ip'
import { aggregate } from './aggregate'

const agg = (...list: string[]) => aggregate(list.map((s) => parsePrefix(s)!)).map((p) => p.cidr)

describe('aggregate', () => {
  it('merges siblings recursively', () => {
    expect(agg('10.0.0.0/24', '10.0.1.0/24', '10.0.2.0/24', '10.0.3.0/24')).toEqual(['10.0.0.0/22'])
  })
  it('drops covered prefixes', () => {
    expect(agg('10.0.0.0/16', '10.0.5.0/24', '11.0.0.0/8')).toEqual(['10.0.0.0/16', '11.0.0.0/8'])
  })
  it('does not merge non-siblings', () => {
    expect(agg('10.0.1.0/24', '10.0.2.0/24')).toEqual(['10.0.1.0/24', '10.0.2.0/24'])
  })
  it('never merges above the floor length', () => {
    const list = ['10.0.0.0/9', '10.128.0.0/9'].map((s) => parsePrefix(s)!)
    expect(aggregate(list, () => 9).map((p) => p.cidr)).toEqual(['10.0.0.0/9', '10.128.0.0/9'])
    expect(aggregate(list).map((p) => p.cidr)).toEqual(['10.0.0.0/8'])
  })
  it('handles both families', () => {
    expect(agg('2001:db8::/33', '2001:db8:8000::/33', '192.0.2.0/25', '192.0.2.128/25')).toEqual([
      '192.0.2.0/24',
      '2001:db8::/32',
    ])
  })
})
