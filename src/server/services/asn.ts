import '@tanstack/react-start/server-only'

import { parsePrefix, type Prefix } from '~/lib/ip'
import { aggregate } from '~/lib/analysis/aggregate'
import { collect, type BgpRow } from '~/lib/analysis/collect'
import type { Notice, PrefixSummary, SourceStates } from '~/lib/analysis/types'
import { env } from '../env'
import { asName, bgpByOrigin } from '../sources/bgptools'
import { routesByOrigin } from '../sources/irrd'
import { originatedByAsn } from '../sources/ripestat'
import { roasByOrigin } from '../sources/rpki'
import { gather } from './gather'
import { minLengthFor } from './prefix'
import { namesFor } from './names'

export interface AsnReport {
  asn: number
  name: string | null
  directOrigin: PrefixSummary[]
  overlaps: PrefixSummary[]
  sources: SourceStates
  notices: Notice[]
  asNames: Record<string, string>
}

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err))

export async function asnReport(asn: number): Promise<AsnReport> {
  const notices: Notice[] = []
  const [irrResult] = await Promise.allSettled([routesByOrigin(asn)])
  const irr = irrResult.status === 'fulfilled' ? irrResult.value : []

  let bgp: BgpRow[] | null = bgpByOrigin(asn)
  let fallbackBgp: BgpRow[] | null = null
  if (bgp === null) {
    try {
      fallbackBgp = await originatedByAsn(asn)
      bgp = fallbackBgp
    } catch (err) {
      notices.push({
        source: 'ripestat',
        level: 'info',
        text: `RIPEstat unavailable: ${reason(err)}.`,
      })
    }
  }
  const roas = roasByOrigin(asn) ?? []

  const seeds: Prefix[] = []
  for (const cidr of [
    ...irr.map((r) => r.prefix),
    ...(bgp ?? []).map((r) => r.prefix),
    ...roas.map((r) => r.prefix),
  ]) {
    const p = parsePrefix(cidr)
    if (p && p.length >= minLengthFor(p)) seeds.push(p)
  }
  // Merge, but never into anything shorter than the minimum query length.
  const aggregates = aggregate(seeds, (version) =>
    version === 4 ? env().MIN_PREFIX_LENGTH_V4 : env().MIN_PREFIX_LENGTH_V6,
  )

  const g = await gather(aggregates, { extraBgp: fallbackBgp })
  if (irrResult.status === 'rejected' && g.sources.irr.status === 'ok') {
    g.sources.irr = { status: 'unavailable', detail: reason(irrResult.reason) }
    g.notices.push({
      source: 'irr',
      level: 'danger',
      text: `IRRd unavailable: ${reason(irrResult.reason)}.`,
    })
  }
  const rows = collect(g.input)

  const isDirect = (r: PrefixSummary) =>
    r.bgpOrigins.some((o) => o.asn === asn) ||
    r.rpkiRoutes.some((o) => o.asn === asn) ||
    Object.values(r.irrRoutes).some((list) => list.some((o) => o.asn === asn))

  return {
    asn,
    name: asName(asn),
    directOrigin: rows.filter(isDirect),
    overlaps: rows.filter((r) => !isDirect(r)),
    sources: g.sources,
    notices: [...notices, ...g.notices],
    asNames: namesFor(rows, [asn]),
  }
}
