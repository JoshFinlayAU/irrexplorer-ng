// Status messages per prefix row. The checks, their order, wording and
// severities follow the original IRR Explorer (irrexplorer/api/report.py);
// see memory/parity.md for the item-by-item list. The only addition is the
// "checks skipped" message when a source is unavailable, so a missing source
// can never produce "Everything looks good".

import { parsePrefix } from '../ip'
import { specialUseOverlaps } from './special-use'
import {
  CATEGORY_ORDER,
  type Category,
  type Message,
  type PrefixSummary,
  type RirName,
} from './types'

/** The IRR each RIR's route objects are expected to live in. */
export const EXPECTED_IRR: Record<RirName, string> = {
  'RIPE NCC': 'RIPE',
  ARIN: 'ARIN',
  AFRINIC: 'AFRINIC',
  LACNIC: 'LACNIC',
  APNIC: 'APNIC',
  'Registro.BR': 'TC',
}

export interface Availability {
  bgp: boolean
  irr: boolean
  rpki: boolean
  rir: boolean
}

export const ALL_AVAILABLE: Availability = { bgp: true, irr: true, rpki: true, rir: true }

const difference = (a: Set<number>, b: Set<number>) => new Set([...a].filter((x) => !b.has(x)))
const intersects = (a: Set<number>, b: Set<number>) => [...a].some((x) => b.has(x))

type Unrated = Omit<PrefixSummary, 'messages' | 'categoryOverall' | 'goodnessOverall'>

export function buildMessages(row: Unrated, available: Availability = ALL_AVAILABLE): Message[] {
  const messages: Message[] = []
  const add = (category: Category, text: string) => messages.push({ category, text })

  const bgp = new Set(row.bgpOrigins.map((o) => o.asn))
  const sources = Object.keys(row.irrRoutes).filter((s) => (row.irrRoutes[s]?.length ?? 0) > 0)
  const irr = new Set(sources.flatMap((s) => row.irrRoutes[s]!.map((r) => r.asn)))
  const rpki = new Set(row.rpkiRoutes.map((r) => r.asn))
  const expected = available.rir && row.rir ? EXPECTED_IRR[row.rir] : null
  const irrExpected = new Set(expected ? (row.irrRoutes[expected] ?? []).map((r) => r.asn) : [])
  const irrOther = new Set(
    sources.filter((s) => s !== expected).flatMap((s) => row.irrRoutes[s]!.map((r) => r.asn)),
  )
  const hasRouteObjects = sources.length > 0
  const hasExpectedObjects = expected !== null && (row.irrRoutes[expected]?.length ?? 0) > 0

  // 1, 2: not seen in the DFZ
  if (available.bgp && available.irr && bgp.size === 0 && irr.size > 0) {
    add('info', 'Route objects exist, but prefix not seen in DFZ')
  }
  if (
    available.bgp &&
    available.rpki &&
    bgp.size === 0 &&
    rpki.size > 0 &&
    !(rpki.size === 1 && rpki.has(0))
  ) {
    add('info', 'RPKI ROA exists, but prefix not seen in DFZ')
  }

  // 3: objects only outside the RIR's own IRR
  if (available.irr && expected && hasRouteObjects && !hasExpectedObjects) {
    add('warning', `Expected route object in ${expected}, but only found in other IRRs`)
  }

  // 4 to 8: origin checks, at most one fires
  if (available.bgp && available.irr) {
    const missing = difference(bgp, irr)
    if (missing.size > 0) {
      if (intersects(bgp, irr)) add('danger', 'No route objects for some DFZ origins')
      else add('danger', 'No route objects match DFZ origin')
    } else if (expected && hasExpectedObjects && difference(bgp, irrExpected).size > 0) {
      add(
        'danger',
        `Expected route object in ${expected}, but BGP origin does not match. Objects from other IRRs do match BGP origin`,
      )
    } else if (expected && irrOther.size > 0 && difference(bgp, irrOther).size > 0) {
      add(
        'warning',
        `Expected route object in ${expected} matches BGP origin, but non-matching objects exist in other IRRs`,
      )
    } else if (irr.size > 1 && bgp.size === 1) {
      add('warning', 'Multiple route objects exist with different origins, but DFZ only has one')
    }
  }

  // 9 to 11: RPKI
  if (available.rpki) {
    if (available.bgp && rpki.size > 0 && difference(bgp, rpki).size > 0) {
      add('danger', 'RPKI origin does not match BGP origin')
    }
    if (available.irr) {
      const routes = sources.flatMap((s) => row.irrRoutes[s]!)
      if (routes.some((r) => r.rpki.state === 'invalid')) {
        add('danger', 'RPKI-invalid route objects found')
      } else if (routes.length > 0 && routes.every((r) => r.rpki.state === 'not-found')) {
        add('info', 'No (covering) RPKI ROA found for route objects')
      }
    }
  }

  // 12: special-use space
  const prefix = parsePrefix(row.prefix)
  if (prefix) {
    for (const s of specialUseOverlaps(prefix)) {
      add('danger', `Overlaps with ${s.name} special use prefix ${s.prefix.cidr}`)
    }
  }

  const skipped = (['bgp', 'irr', 'rpki'] as const).filter((k) => !available[k])
  if (skipped.length > 0) {
    const names = { bgp: 'BGP', irr: 'IRR', rpki: 'RPKI' }
    add(
      'info',
      `Some checks were skipped because ${skipped.map((k) => names[k]).join(', ')} data is unavailable`,
    )
  }

  // 13: nothing to report
  if (messages.length === 0) add('success', 'Everything looks good')

  // Stable sort by severity, keeping emission order within a category.
  return messages
    .map((m, i) => ({ m, i }))
    .sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(a.m.category) - CATEGORY_ORDER.indexOf(b.m.category) || a.i - b.i,
    )
    .map(({ m }) => m)
}

export function rate(row: Unrated, available: Availability = ALL_AVAILABLE): PrefixSummary {
  const messages = buildMessages(row, available)
  const goodnessOverall = Math.min(...messages.map((m) => CATEGORY_ORDER.indexOf(m.category)))
  return {
    ...row,
    messages,
    categoryOverall: CATEGORY_ORDER[goodnessOverall] ?? 'success',
    goodnessOverall,
  }
}
