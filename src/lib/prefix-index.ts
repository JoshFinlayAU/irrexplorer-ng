// Compact in-memory index of (prefix, value) rows for the bulk datasets
// (bgp.tools table, RPKI VRPs, RIR delegations). Rows are sorted by a
// fixed-width key so exact and more-specific lookups are a binary search and
// a contiguous scan; less-specific lookups probe each shorter length.

import { formatIp, makePrefix, maxLength, prefixSortKey, type Prefix, type PrefixParts } from './ip'

export interface IndexedRow {
  prefix: Prefix
  value: number
}

function keyToPrefix(key: string): Prefix {
  const version = key[0] === '4' ? 4 : 6
  const width = version === 4 ? 8 : 32
  const network = BigInt(`0x${key.slice(1, 1 + width)}`)
  const length = parseInt(key.slice(1 + width), 16)
  return { version, network, length, cidr: `${formatIp(version, network)}/${length}` }
}

interface BuildOptions {
  indexByValue?: (value: number) => number
}

/** Collects rows with minimal memory: one key string and one number each. */
export class PrefixIndexBuilder {
  private readonly keys: string[] = []
  private readonly vals: number[] = []

  get size(): number {
    return this.keys.length
  }

  add(prefix: PrefixParts, value: number): void {
    this.keys.push(prefixSortKey(prefix))
    this.vals.push(value)
  }

  build(options: BuildOptions = {}): PrefixIndex {
    return PrefixIndex.fromKeys(this.keys, this.vals, options)
  }
}

export class PrefixIndex {
  private readonly keys: string[]
  private readonly values: Float64Array
  private readonly byValue: Map<number, Uint32Array> | null

  private constructor(
    keys: string[],
    values: Float64Array,
    byValue: Map<number, Uint32Array> | null,
  ) {
    this.keys = keys
    this.values = values
    this.byValue = byValue
  }

  get size(): number {
    return this.keys.length
  }

  /** Build from rows. Values must be finite numbers (pack richer data yourself). */
  static build(rows: Iterable<IndexedRow>, options: BuildOptions = {}): PrefixIndex {
    const builder = new PrefixIndexBuilder()
    for (const row of rows) builder.add(row.prefix, row.value)
    return builder.build(options)
  }

  /** Build from parallel key/value arrays (see PrefixIndexBuilder). */
  static fromKeys(keys: string[], vals: number[], options: BuildOptions = {}): PrefixIndex {
    const order = new Uint32Array(keys.length)
    for (let i = 0; i < order.length; i++) order[i] = i
    order.sort((a, b) => {
      const ka = keys[a]!
      const kb = keys[b]!
      return ka < kb ? -1 : ka > kb ? 1 : vals[a]! - vals[b]!
    })
    const sortedKeys = new Array<string>(order.length)
    const sortedVals = new Float64Array(order.length)
    for (let i = 0; i < order.length; i++) {
      sortedKeys[i] = keys[order[i]!]!
      sortedVals[i] = vals[order[i]!]!
    }

    let byValue: Map<number, Uint32Array> | null = null
    if (options.indexByValue) {
      const groups = new Map<number, number[]>()
      for (let i = 0; i < sortedVals.length; i++) {
        const k = options.indexByValue(sortedVals[i]!)
        let list = groups.get(k)
        if (!list) {
          list = []
          groups.set(k, list)
        }
        list.push(i)
      }
      byValue = new Map([...groups].map(([k, list]) => [k, Uint32Array.from(list)]))
    }
    return new PrefixIndex(sortedKeys, sortedVals, byValue)
  }

  private lowerBound(key: string): number {
    let lo = 0
    let hi = this.keys.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (this.keys[mid]! < key) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  private rowAt(i: number): IndexedRow {
    return { prefix: keyToPrefix(this.keys[i]!), value: this.values[i]! }
  }

  exact(p: Prefix): IndexedRow[] {
    const key = prefixSortKey(p)
    const out: IndexedRow[] = []
    for (let i = this.lowerBound(key); i < this.keys.length && this.keys[i] === key; i++) {
      out.push({ prefix: p, value: this.values[i]! })
    }
    return out
  }

  /** Prefixes inside p. Includes p itself when includeExact is set. */
  moreSpecific(p: Prefix, includeExact = true, limit = Infinity): IndexedRow[] {
    const start = prefixSortKey(p)
    const last = makePrefix(
      p.version,
      p.network | ((1n << BigInt(maxLength(p.version) - p.length)) - 1n),
      maxLength(p.version),
    )
    const end = prefixSortKey(last)
    const out: IndexedRow[] = []
    for (let i = this.lowerBound(start); i < this.keys.length && this.keys[i]! <= end; i++) {
      if (!includeExact && this.keys[i] === start) continue
      out.push(this.rowAt(i))
      if (out.length >= limit) break
    }
    return out
  }

  /** Strictly shorter prefixes covering p. */
  lessSpecific(p: Prefix): IndexedRow[] {
    const out: IndexedRow[] = []
    for (let len = 0; len < p.length; len++)
      out.push(...this.exact(makePrefix(p.version, p.network, len)))
    return out
  }

  /** Exact, less specific and more specific rows: everything overlapping p. */
  overlapping(p: Prefix, limit = Infinity): IndexedRow[] {
    return [...this.lessSpecific(p), ...this.moreSpecific(p, true, limit)]
  }

  /** Rows whose indexByValue key equals k (e.g. every prefix for an ASN). */
  withValueKey(k: number): IndexedRow[] {
    if (!this.byValue) throw new Error('index was built without indexByValue')
    return Array.from(this.byValue.get(k) ?? [], (i) => this.rowAt(i))
  }
}
