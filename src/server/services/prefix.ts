import '@tanstack/react-start/server-only'

import { covers, maxLength, parsePrefix, type Prefix } from '~/lib/ip'
import { collect } from '~/lib/analysis/collect'
import type { Notice, PrefixSummary, SourceStates } from '~/lib/analysis/types'
import { env } from '../env'
import { visibilityFrom, type RisVisibility } from '../sources/ripestat'
import { gather } from './gather'
import { namesFor } from './names'

export interface PrefixTable {
  prefix: string
  rows: PrefixSummary[]
  tooLarge: boolean
}

export interface PrefixReport {
  query: string
  isHost: boolean
  minLength: number
  tooLarge: boolean
  overlaps: PrefixSummary[]
  leastSpecific: PrefixTable | null
  /** For a host query: the most specific announced prefix covering it. */
  coveringAnnounced: string | null
  visibility: RisVisibility | null
  sources: SourceStates
  notices: Notice[]
  asNames: Record<string, string>
}

export function minLengthFor(p: Prefix): number {
  return p.version === 4 ? env().MIN_PREFIX_LENGTH_V4 : env().MIN_PREFIX_LENGTH_V6
}

export async function prefixReport(cidr: string): Promise<PrefixReport> {
  const prefix = parsePrefix(cidr)
  if (!prefix) throw new Error(`Invalid prefix: ${cidr}`)
  const isHost = prefix.length === maxLength(prefix.version)
  const minLength = minLengthFor(prefix)
  const query = isHost ? prefix.cidr.replace(/\/\d+$/, '') : prefix.cidr
  const base = { query, isHost, minLength }

  if (prefix.length < minLength) {
    // Refuse before touching any upstream: an IRRd ipAny on a /8 is expensive.
    const ok = { status: 'ok' } as const
    return {
      ...base,
      tooLarge: true,
      overlaps: [],
      leastSpecific: null,
      coveringAnnounced: null,
      visibility: null,
      sources: { irr: ok, bgp: ok, rpki: ok, rir: ok },
      notices: [],
      asNames: {},
    }
  }
  const g = await gather([prefix], { ripestat: true })

  const overlaps = collect(g.input)

  // Second table: everything overlapping the least specific prefix found.
  let leastSpecific: PrefixTable | null = null
  const shortest = overlaps
    .map((r) => parsePrefix(r.prefix)!)
    .filter((p) => p.version === prefix.version)
    .sort((a, b) => a.length - b.length)[0]
  if (shortest && (shortest.length < prefix.length || isHost)) {
    if (shortest.length < minLengthFor(shortest)) {
      leastSpecific = { prefix: shortest.cidr, rows: [], tooLarge: true }
    } else {
      const g2 = await gather([shortest])
      leastSpecific = { prefix: shortest.cidr, rows: collect(g2.input), tooLarge: false }
      for (const n of g2.notices) {
        if (!g.notices.some((x) => x.text === n.text)) g.notices.push(n)
      }
    }
  }

  const coveringAnnounced = isHost
    ? (overlaps
        .filter((r) => r.bgpOrigins.length > 0)
        .map((r) => parsePrefix(r.prefix)!)
        .filter((p) => covers(p, prefix))
        .sort((a, b) => b.length - a.length)[0]?.cidr ?? null)
    : null

  return {
    ...base,
    tooLarge: false,
    overlaps,
    leastSpecific,
    coveringAnnounced,
    visibility: g.routing ? visibilityFrom(prefix, g.routing) : null,
    sources: g.sources,
    notices: g.notices,
    asNames: namesFor([...overlaps, ...(leastSpecific?.rows ?? [])]),
  }
}
