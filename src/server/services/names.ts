import '@tanstack/react-start/server-only'

import type { PrefixSummary } from '~/lib/analysis/types'
import { asName } from '../sources/bgptools'

/** AS names for every ASN that appears in the rows, for tooltips. */
export function namesFor(
  rows: readonly PrefixSummary[],
  extra: number[] = [],
): Record<string, string> {
  const asns = new Set<number>(extra)
  for (const r of rows) {
    for (const o of r.bgpOrigins) asns.add(o.asn)
    for (const roa of r.rpkiRoutes) asns.add(roa.asn)
    for (const list of Object.values(r.irrRoutes)) for (const i of list) asns.add(i.asn)
  }
  const out: Record<string, string> = {}
  for (const asn of asns) {
    const name = asName(asn)
    if (name) out[asn] = name
  }
  return out
}
