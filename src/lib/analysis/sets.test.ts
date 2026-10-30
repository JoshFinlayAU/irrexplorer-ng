import { describe, expect, it } from 'vitest'
import { expandSet, isSetMember, stripRangeOperator, type SetLevelResult } from './sets'

function resolver(db: Record<string, { source: string; members: string[] }[]>) {
  const calls: string[][] = []
  const fn = (names: string[]): Promise<SetLevelResult[]> => {
    calls.push(names)
    return Promise.resolve(names.flatMap((n) => (db[n] ?? []).map((e) => ({ name: n, ...e }))))
  }
  return { fn, calls }
}

describe('set members', () => {
  it('classifies members', () => {
    expect(isSetMember('AS3333')).toBe(false)
    expect(isSetMember('AS-FOO')).toBe(true)
    expect(isSetMember('AS3333:AS-FOO')).toBe(true)
    expect(isSetMember('192.0.2.0/24^+')).toBe(false)
    expect(isSetMember('RS-FOO^24-32')).toBe(true)
    expect(stripRangeOperator('RS-FOO^-')).toBe('RS-FOO')
  })
})

describe('expandSet', () => {
  it('expands breadth first with one call per level', async () => {
    const { fn, calls } = resolver({
      'AS-A': [{ source: 'RIPE', members: ['AS1', 'AS-B', 'AS-C'] }],
      'AS-B': [
        { source: 'RIPE', members: ['AS2'] },
        { source: 'RADB', members: ['AS3', 'AS-D'] },
      ],
      'AS-C': [{ source: 'RADB', members: ['AS-B'] }],
      'AS-D': [{ source: 'RADB', members: ['AS4'] }],
    })
    const r = await expandSet('as-a', 'as-set', fn)
    expect(calls).toEqual([['AS-A'], ['AS-B', 'AS-C'], ['AS-D']])
    expect(r.found).toBe(true)
    expect(r.truncated).toBe(false)
    expect(r.depthReached).toBe(3)
    expect(r.rows.map((x) => `${x.depth} ${x.name} ${x.source} ${x.path.join('>')}`)).toEqual([
      '1 AS-A RIPE AS-A',
      '2 AS-B RADB AS-A>AS-B',
      '2 AS-B RIPE AS-A>AS-B',
      '2 AS-C RADB AS-A>AS-C',
      '3 AS-B RADB AS-A>AS-C>AS-B',
      '3 AS-B RIPE AS-A>AS-C>AS-B',
      '3 AS-D RADB AS-A>AS-B>AS-D',
      '4 AS-D RADB AS-A>AS-C>AS-B>AS-D',
    ])
  })

  it('flags loops and missing sets', async () => {
    const { fn } = resolver({
      'AS-A': [{ source: 'RIPE', members: ['AS-B', 'AS-GONE'] }],
      'AS-B': [{ source: 'RIPE', members: ['AS-A'] }],
    })
    const r = await expandSet('AS-A', 'as-set', fn)
    expect(r.sets['AS-A|RIPE']!.missing).toEqual(['AS-GONE'])
    expect(r.rows[1]!.loops).toEqual(['AS-A'])
    expect(r.rows[0]!.loops).toEqual([])
  })

  it('reports not found', async () => {
    const { fn } = resolver({})
    const r = await expandSet('AS-NOPE', 'as-set', fn)
    expect(r.found).toBe(false)
    expect(r.rows).toEqual([])
  })

  it('truncates past the limit', async () => {
    const db: Record<string, { source: string; members: string[] }[]> = {
      'AS-ROOT': [{ source: 'RIPE', members: Array.from({ length: 5 }, (_, i) => `AS-L${i}`) }],
    }
    for (let i = 0; i < 5; i++)
      db[`AS-L${i}`] = [{ source: 'RIPE', members: [`AS-M${i}a`, `AS-M${i}b`] }]
    const { fn } = resolver(db)
    const r = await expandSet('AS-ROOT', 'as-set', fn, 4)
    expect(r.truncated).toBe(true)
    expect(r.depthReached).toBe(1)
    expect(r.rows).toHaveLength(1)
  })
})
