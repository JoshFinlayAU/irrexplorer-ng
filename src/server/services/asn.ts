import '@tanstack/react-start/server-only'

import { parsePrefix, type Prefix } from '~/lib/ip'
import { aggregate } from '~/lib/analysis/aggregate'
import { collect, type BgpRow } from '~/lib/analysis/collect'
import { mergeGeo } from '~/lib/analysis/geo'
import type {
  GeoAvailability,
  GeoBreakdown,
  Notice,
  PrefixSummary,
  SourceStates,
} from '~/lib/analysis/types'
import { env } from '../env'
import { asName, bgpByOrigin } from '../sources/bgptools'
import { geoAvailability, withGeo } from '../sources/geoip'
import { routesByOrigin } from '../sources/irrd'
import { originatedByAsn } from '../sources/ripestat'
import { gather } from './gather'
import { minLengthFor } from './prefix'
import { namesFor } from './names'

export interface AsnReport {
  asn: number
  name: string | null
  directOrigin: PrefixSummary[]
  overlaps: PrefixSummary[]
  /** Where the prefixes this ASN announces in BGP are, by address share. */
  geo: GeoBreakdown | null
  geoip: GeoAvailability
  sources: SourceStates
  notices: Notice[]
  asNames: Record<string, string>
}

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err))

export async function asnReport(asn: number): Promise<AsnReport> {
  const notices: Notice[] = []
  const [irrResult] = await Promise.allSettled([routesByOrigin(asn)])
  const { irr, roas } = irrResult.status === 'fulfilled' ? irrResult.value : { irr: [], roas: [] }

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
    g.sources.rpki = g.sources.irr
  }
  const rows = withGeo(collect(g.input))

  const isDirect = (r: PrefixSummary) =>
    r.bgpOrigins.some((o) => o.asn === asn) ||
    r.rpkiRoutes.some((o) => o.asn === asn) ||
    Object.values(r.irrRoutes).some((list) => list.some((o) => o.asn === asn))

  return {
    asn,
    name: asName(asn),
    directOrigin: rows.filter(isDirect),
    overlaps: rows.filter((r) => !isDirect(r)),
    geo: mergeGeo(
      rows.flatMap((r) => {
        const prefix = r.bgpOrigins.some((o) => o.asn === asn) ? parsePrefix(r.prefix) : null
        return prefix && r.geo ? [{ prefix, geo: r.geo }] : []
      }),
    ),
    geoip: geoAvailability(),
    sources: g.sources,
    notices: [...notices, ...g.notices],
    asNames: namesFor(rows, [asn]),
  }
}
