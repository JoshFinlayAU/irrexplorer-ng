// RFC 6811 route origin validation against a set of VRPs. Pure: the caller
// passes every VRP that covers the route prefix.

import { coveringPrefixes, parsePrefix, type Prefix } from '../ip'
import type { RoaRow } from './collect'
import type { Roa, RpkiValidity } from './types'

/**
 * Validate a route (prefix length + origin) against the covering VRPs.
 * A VRP matches when its ASN equals the origin, the origin is not AS0, and
 * the route length does not exceed the VRP max length.
 */
export function validateOrigin(
  routeLength: number,
  origin: number,
  coveringVrps: readonly Roa[],
): RpkiValidity {
  if (coveringVrps.length === 0) return { state: 'not-found' }
  let sameAsTooLong = false
  for (const vrp of coveringVrps) {
    if (vrp.asn !== origin || origin === 0) continue
    if (routeLength <= vrp.maxLength) return { state: 'valid' }
    sameAsTooLong = true
  }
  return { state: 'invalid', reason: sameAsTooLong ? 'length' : 'as' }
}

/**
 * A validator over a list of ROAs. The list must hold every ROA covering any
 * prefix that will be validated, which an IRRd ipAny lookup on the query
 * prefixes guarantees for every row it returns.
 */
export function validatorFrom(roas: readonly RoaRow[]): (p: Prefix, asn: number) => RpkiValidity {
  const byPrefix = new Map<string, Roa[]>()
  for (const r of roas) {
    const cidr = parsePrefix(r.prefix)?.cidr
    if (!cidr) continue
    const list = byPrefix.get(cidr) ?? []
    list.push({ asn: r.asn, maxLength: r.maxLength })
    byPrefix.set(cidr, list)
  }
  return (p, asn) =>
    validateOrigin(
      p.length,
      asn,
      coveringPrefixes(p).flatMap((c) => byPrefix.get(c.cidr) ?? []),
    )
}

export function describeValidity(v: RpkiValidity): string {
  switch (v.state) {
    case 'valid':
      return 'RPKI valid'
    case 'not-found':
      return 'RPKI not found (no covering ROA)'
    case 'unknown':
      return 'RPKI status unknown (RPKI data unavailable)'
    case 'invalid':
      return v.reason === 'length'
        ? 'RPKI invalid: prefix longer than the ROA max length'
        : 'RPKI invalid: no ROA authorises this origin ASN'
  }
}
