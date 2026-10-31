// Gather every source for a set of query prefixes, tolerating failures: each
// source either contributes rows or is marked degraded/unavailable with a
// notice, and the page still renders.
import '@tanstack/react-start/server-only'

import type { Prefix } from '~/lib/ip'
import type { BgpRow, CollectInput, IrrRow, RoaRow } from '~/lib/analysis/collect'
import { validatorFrom } from '~/lib/analysis/rpki'
import type { Notice, SourceStates } from '~/lib/analysis/types'
import { bgpOverlapping, bgpTable } from '../sources/bgptools'
import { geoip } from '../sources/geoip'
import { peeringdb } from '../sources/peeringdb'
import { routesOverlapping, rpkiSource, type IrrdRoutes } from '../sources/irrd'
import { bgpRowsFrom, routingStatus, type RoutingStatus } from '../sources/ripestat'
import { rirOverlapping } from '../sources/rirstats'

export interface Gathered {
  input: CollectInput
  sources: SourceStates
  notices: Notice[]
  routing: RoutingStatus | null
}

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err))

function union<T>(lists: (T[] | null)[]): T[] | null {
  if (lists.some((l) => l === null)) return null
  return lists.flat() as T[]
}

export async function gather(
  prefixes: readonly Prefix[],
  options: { ripestat?: boolean; extraBgp?: BgpRow[] | null } = {},
): Promise<Gathered> {
  const notices: Notice[] = []
  const sources: SourceStates = {
    irr: { status: 'ok' },
    bgp: { status: 'ok' },
    rpki: { status: 'ok' },
    rir: { status: 'ok' },
  }

  // Give a cold-started table a moment, but never block a request on a download.
  await Promise.all([bgpTable.ready(250), geoip.ready(250), peeringdb.ready(250)])

  const wantRipestat = options.ripestat === true && prefixes.length === 1
  const [irrResult, risResult, rpkiResult] = await Promise.allSettled([
    prefixes.length > 0
      ? routesOverlapping(prefixes)
      : Promise.resolve<IrrdRoutes>({ irr: [], roas: [] }),
    wantRipestat ? routingStatus(prefixes[0]!) : Promise.resolve(null),
    rpkiSource(),
  ])

  // ROAs come from IRRd's RPKI source in the same lookup, so they fail together.
  let irr: IrrRow[] | null = null
  let roas: RoaRow[] | null = null
  if (irrResult.status === 'fulfilled') {
    irr = irrResult.value.irr
    roas = irrResult.value.roas
  } else {
    sources.irr = { status: 'unavailable', detail: reason(irrResult.reason) }
    sources.rpki = { status: 'unavailable', detail: reason(irrResult.reason) }
    notices.push({
      source: 'irr',
      level: 'danger',
      text: `IRRd unavailable: ${reason(irrResult.reason)}. IRR and RPKI columns and checks are missing.`,
    })
  }
  // An IRRd without an RPKI source has no ROAs, which must not read as "not found".
  // If the status lookup itself fails, trust the route lookup that worked.
  if (roas !== null && rpkiResult.status === 'fulfilled' && rpkiResult.value === null) {
    roas = null
    sources.rpki = { status: 'unavailable', detail: 'IRRd has no RPKI source' }
    notices.push({
      source: 'rpki',
      level: 'danger',
      text: 'IRRd has no RPKI source configured. RPKI columns show "unknown", which is not the same as "not found".',
    })
  }

  const routing = risResult.status === 'fulfilled' ? risResult.value : null
  if (risResult.status === 'rejected') {
    notices.push({
      source: 'ripestat',
      level: 'info',
      text: `RIPEstat unavailable: ${reason(risResult.reason)}. RIS visibility is not shown.`,
    })
  }

  let bgp = union(prefixes.map((p) => bgpOverlapping(p)))
  if (bgp === null) {
    const status = bgpTable.status()
    const why = status.lastError ? `failed to load (${status.lastError})` : 'is still loading'
    if (options.extraBgp) {
      bgp = options.extraBgp
      sources.bgp = { status: 'degraded', detail: `bgp.tools table ${why}; using RIPE RIS` }
      notices.push({
        source: 'bgp',
        level: 'warning',
        text: `bgp.tools table ${why}. BGP origins come from RIPE RIS instead and only cover this ASN's own announcements.`,
      })
    } else if (routing) {
      bgp = bgpRowsFrom(prefixes[0]!, routing)
      sources.bgp = { status: 'degraded', detail: `bgp.tools table ${why}; using RIPE RIS` }
      notices.push({
        source: 'bgp',
        level: 'warning',
        text: `bgp.tools table ${why}. BGP origins come from RIPE RIS instead.`,
      })
    } else {
      sources.bgp = { status: 'unavailable', detail: `bgp.tools table ${why}` }
      notices.push({
        source: 'bgp',
        level: 'danger',
        text: `BGP data unavailable: bgp.tools table ${why}. BGP columns and origin checks are missing.`,
      })
    }
  } else if (options.extraBgp) {
    bgp = [...bgp, ...options.extraBgp]
  }

  const rir = union(prefixes.map((p) => rirOverlapping(p)))
  if (rir === null) {
    sources.rir = { status: 'unavailable', detail: 'RIR delegation data not loaded' }
    notices.push({
      source: 'rir',
      level: 'warning',
      text: 'RIR delegation data unavailable. The RIR column is blank and expected-IRR checks are skipped.',
    })
  }

  const validate = roas ? validatorFrom(roas) : null
  return { input: { bgp, irr, roas, rir, validate }, sources, notices, routing }
}
