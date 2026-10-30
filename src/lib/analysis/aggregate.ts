// Prefix aggregation: drop prefixes covered by another one, then merge
// adjacent siblings into their parent until nothing changes.

import { comparePrefixes, covers, makePrefix, maxLength, type Prefix } from '../ip'

export function aggregate(prefixes: readonly Prefix[]): Prefix[] {
  const byFamily = new Map<4 | 6, Prefix[]>()
  for (const p of prefixes) {
    const list = byFamily.get(p.version) ?? []
    list.push(p)
    byFamily.set(p.version, list)
  }
  const out: Prefix[] = []
  for (const list of byFamily.values()) out.push(...aggregateFamily(list))
  return out.sort(comparePrefixes)
}

function dropCovered(sorted: Prefix[]): Prefix[] {
  const kept: Prefix[] = []
  for (const p of sorted) {
    const last = kept[kept.length - 1]
    if (last && covers(last, p)) continue
    kept.push(p)
  }
  return kept
}

function aggregateFamily(list: Prefix[]): Prefix[] {
  let current = dropCovered([...list].sort(comparePrefixes))
  for (;;) {
    const merged: Prefix[] = []
    let changed = false
    for (let i = 0; i < current.length; i++) {
      const a = current[i]!
      const b = current[i + 1]
      if (b && a.length === b.length && a.length > 0) {
        const parent = makePrefix(a.version, a.network, a.length - 1)
        const size = 1n << BigInt(maxLength(a.version) - a.length)
        if (parent.network === a.network && b.network === a.network + size) {
          merged.push(parent)
          i++
          changed = true
          continue
        }
      }
      merged.push(a)
    }
    current = dropCovered(merged.sort(comparePrefixes))
    if (!changed) return current
  }
}
