// Merge normalised rows from every source into one PrefixSummary per prefix.
// Pure: RPKI validation is injected so this stays free of any data source.

import { comparePrefixes, covers, parsePrefix, type Prefix } from '../ip'
import { rate, type Availability } from './report'
import type { IrrRoute, PrefixSummary, Roa, RirName, RpkiValidity } from './types'

export interface BgpRow {
  prefix: string
  asn: number
}
export interface RoaRow {
  prefix: string
  asn: number
  maxLength: number
}
export interface IrrRow {
  prefix: string
  asn: number
  source: string
  rpslPk: string
}
export interface RirRow {
  prefix: string
  rir: RirName
}

export interface CollectInput {
  /** null means the source is unavailable for this request. */
  bgp: BgpRow[] | null
  roas: RoaRow[] | null
  irr: IrrRow[] | null
  rir: RirRow[] | null
  /** RFC 6811 validation of (prefix, origin), or null when RPKI is unavailable. */
  validate: ((prefix: Prefix, asn: number) => RpkiValidity) | null
}

const UNKNOWN: RpkiValidity = { state: 'unknown' }

/**
 * Pick the RIR for a row: a NIR (Registro.BR) wins if any entry overlaps;
 * otherwise the most specific entry covering the prefix; otherwise the first
 * entry contained inside it (a large announcement spanning several blocks).
 */
export function pickRir(
  p: Prefix,
  rows: readonly { prefix: Prefix; rir: RirName }[],
): RirName | null {
  const overlapping = rows.filter((r) => covers(r.prefix, p) || covers(p, r.prefix))
  if (overlapping.length === 0) return null
  const nir = overlapping.find((r) => r.rir === 'Registro.BR')
  if (nir) return nir.rir
  const covering = overlapping
    .filter((r) => covers(r.prefix, p))
    .sort((a, b) => b.prefix.length - a.prefix.length)
  if (covering[0]) return covering[0].rir
  return [...overlapping].sort((a, b) => comparePrefixes(a.prefix, b.prefix))[0]!.rir
}

export function collect(input: CollectInput): PrefixSummary[] {
  interface Acc {
    prefix: Prefix
    bgp: Set<number>
    roas: Map<string, Roa>
    irr: Map<string, Map<string, IrrRoute>>
  }
  const rows = new Map<string, Acc>()
  const get = (cidr: string): Acc | null => {
    const prefix = parsePrefix(cidr)
    if (!prefix) return null
    let acc = rows.get(prefix.cidr)
    if (!acc) {
      acc = { prefix, bgp: new Set(), roas: new Map(), irr: new Map() }
      rows.set(prefix.cidr, acc)
    }
    return acc
  }

  for (const r of input.bgp ?? []) get(r.prefix)?.bgp.add(r.asn)
  for (const r of input.roas ?? []) {
    get(r.prefix)?.roas.set(`${r.asn}/${r.maxLength}`, { asn: r.asn, maxLength: r.maxLength })
  }
  for (const r of input.irr ?? []) {
    const acc = get(r.prefix)
    if (!acc) continue
    const bySource = acc.irr.get(r.source) ?? new Map<string, IrrRoute>()
    const validity = input.validate ? input.validate(acc.prefix, r.asn) : UNKNOWN
    bySource.set(`${r.asn}`, { asn: r.asn, rpslPk: r.rpslPk, rpki: validity })
    acc.irr.set(r.source, bySource)
  }

  const rirRows = (input.rir ?? []).flatMap((r) => {
    const prefix = parsePrefix(r.prefix)
    return prefix ? [{ prefix, rir: r.rir }] : []
  })

  const available: Availability = {
    bgp: input.bgp !== null,
    irr: input.irr !== null,
    rpki: input.roas !== null && input.validate !== null,
    rir: input.rir !== null,
  }

  return [...rows.values()]
    .sort((a, b) => comparePrefixes(a.prefix, b.prefix))
    .map((acc) => {
      const irrRoutes: Record<string, IrrRoute[]> = {}
      for (const source of [...acc.irr.keys()].sort()) {
        irrRoutes[source] = [...acc.irr.get(source)!.values()].sort((a, b) => a.asn - b.asn)
      }
      return rate(
        {
          prefix: acc.prefix.cidr,
          rir: pickRir(acc.prefix, rirRows),
          bgpOrigins: [...acc.bgp]
            .sort((a, b) => a - b)
            .map((asn) => ({
              asn,
              rpki: input.validate ? input.validate(acc.prefix, asn) : UNKNOWN,
            })),
          rpkiRoutes: [...acc.roas.values()].sort(
            (a, b) => a.asn - b.asn || a.maxLength - b.maxLength,
          ),
          irrRoutes,
        },
        available,
      )
    })
}
