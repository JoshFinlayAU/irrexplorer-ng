// RFC 6811 route origin validation against a set of VRPs. Pure: the caller
// passes every VRP that covers the route prefix.

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

export function describeValidity(v: RpkiValidity): string {
  switch (v.state) {
    case 'valid':
      return 'RPKI valid'
    case 'not-found':
      return 'RPKI not found (no covering ROA)'
    case 'unknown':
      return 'RPKI status unknown (validator unavailable)'
    case 'invalid':
      return v.reason === 'length'
        ? 'RPKI invalid: prefix longer than the ROA max length'
        : 'RPKI invalid: no ROA authorises this origin ASN'
  }
}
