// Filtering and ordering of prefix rows, shared by the record and table views
// so both show the same rows in the same order for the same URL.
import { parsePrefix, prefixSortKey } from './ip'
import type { PrefixSummary } from './analysis/types'

// Sorting compares rows many times; parse each prefix once into a string key
// that orders by family, address and length, plus its length.
const sortKeys = new Map<string, { key: string; length: number }>()
export function prefixKey(cidr: string) {
  let k = sortKeys.get(cidr)
  if (!k) {
    if (sortKeys.size > 50_000) sortKeys.clear()
    const p = parsePrefix(cidr)
    k = p ? { key: prefixSortKey(p), length: p.length } : { key: `~${cidr}`, length: 0 }
    sortKeys.set(cidr, k)
  }
  return k
}

export const byAddress = (a: string, b: string) => {
  const ka = prefixKey(a).key
  const kb = prefixKey(b).key
  return ka < kb ? -1 : ka > kb ? 1 : 0
}

const firstOr = (list: number[]) => (list.length > 0 ? list[0]! : Number.POSITIVE_INFINITY)
const diff = (a: number, b: number) => (a === b ? 0 : a < b ? -1 : 1)

/** Ascending comparator for a sort id, as used in the URL ("prefix", "irr:RIPE", ...). */
export function comparator(id: string): (a: PrefixSummary, b: PrefixSummary) => number {
  switch (id) {
    case 'specific':
      return (a, b) =>
        prefixKey(b.prefix).length - prefixKey(a.prefix).length || byAddress(a.prefix, b.prefix)
    case 'rir':
      return (a, b) => (a.rir ?? '~').localeCompare(b.rir ?? '~')
    case 'bgp':
      return (a, b) =>
        diff(firstOr(a.bgpOrigins.map((o) => o.asn)), firstOr(b.bgpOrigins.map((o) => o.asn)))
    case 'rpki':
      return (a, b) =>
        diff(firstOr(a.rpkiRoutes.map((o) => o.asn)), firstOr(b.rpkiRoutes.map((o) => o.asn)))
    case 'advice':
      return (a, b) => a.goodnessOverall - b.goodnessOverall || byAddress(a.prefix, b.prefix)
    default:
      if (id.startsWith('irr:')) {
        const source = id.slice(4)
        return (a, b) =>
          diff(
            firstOr((a.irrRoutes[source] ?? []).map((o) => o.asn)),
            firstOr((b.irrRoutes[source] ?? []).map((o) => o.asn)),
          )
      }
      return (a, b) => byAddress(a.prefix, b.prefix)
  }
}

export function sortRows(
  rows: readonly PrefixSummary[],
  sort: { id: string; desc: boolean },
): PrefixSummary[] {
  const cmp = comparator(sort.id)
  return [...rows].sort((a, b) => (sort.desc ? -cmp(a, b) : cmp(a, b)))
}

export const isIssue = (r: PrefixSummary) =>
  r.categoryOverall === 'danger' || r.categoryOverall === 'warning'

/** Free-text match over prefix, RIR, every ASN, IRR source names and messages. */
export function matchesFilter(r: PrefixSummary, value: string): boolean {
  const needle = value
    .trim()
    .toLowerCase()
    .replace(/^as(?=\d)/, '')
  if (!needle) return true
  const hay = [
    r.prefix,
    r.rir ?? '',
    ...r.bgpOrigins.map((o) => String(o.asn)),
    ...r.rpkiRoutes.map((o) => String(o.asn)),
    ...Object.entries(r.irrRoutes).flatMap(([s, l]) => [s, ...l.map((o) => String(o.asn))]),
    ...r.messages.map((m) => m.text),
  ]
  return hay.some((h) => h.toLowerCase().includes(needle))
}

export function filterRows(
  rows: readonly PrefixSummary[],
  opts: { filter: string; issuesOnly: boolean },
): PrefixSummary[] {
  return rows.filter((r) => (!opts.issuesOnly || isIssue(r)) && matchesFilter(r, opts.filter))
}

/** IRR sources present anywhere in these rows, so record columns line up. */
export function sourcesOf(rows: readonly PrefixSummary[]): string[] {
  return [...new Set(rows.flatMap((r) => Object.keys(r.irrRoutes)))].sort()
}
