// User input normalisation. Every query string goes through classifyQuery once,
// on both client (search box) and server (route params), so the two agree.

import { parsePrefix, maxLength, type Prefix } from './ip'

export type Query =
  | { kind: 'prefix'; prefix: Prefix; cidr: string; isHost: boolean }
  | { kind: 'asn'; asn: number }
  | { kind: 'set'; name: string }
  | { kind: 'invalid'; input: string; reason: string }

const MAX_ASN = 4294967295

/** "AS123", "as123", "123", "AS 123" and asdot "1.10" style all become a number. */
export function parseAsn(input: string): number | null {
  const text = input.trim().replace(/^as\s*/i, '')
  if (/^\d+$/.test(text)) {
    const n = Number(text)
    return Number.isSafeInteger(n) && n <= MAX_ASN ? n : null
  }
  const asdot = /^(\d+)\.(\d+)$/.exec(text)
  if (asdot && input.trim().toUpperCase().startsWith('AS')) {
    const high = Number(asdot[1])
    const low = Number(asdot[2])
    if (high <= 65535 && low <= 65535) return high * 65536 + low
  }
  return null
}

// RPSL set names: an AS-set or route-set component, optionally hierarchical
// (AS123:AS-FOO, RS-BAR:AS456). We accept anything with an AS-/RS- component.
const SET_COMPONENT = /^(AS\d+|AS-[A-Z0-9_-]+|RS-[A-Z0-9_-]+)$/
export function parseSetName(input: string): string | null {
  const name = input.trim().toUpperCase()
  if (name.length === 0 || name.length > 256) return null
  const parts = name.split(':')
  if (!parts.every((p) => SET_COMPONENT.test(p))) return null
  if (!parts.some((p) => p.startsWith('AS-') || p.startsWith('RS-'))) return null
  return name
}

export function setType(name: string): 'as-set' | 'route-set' {
  const last = name
    .split(':')
    .reverse()
    .find((p) => p.startsWith('AS-') || p.startsWith('RS-'))
  return last?.startsWith('RS-') ? 'route-set' : 'as-set'
}

export function classifyQuery(raw: string): Query {
  const input = raw.trim()
  if (input === '')
    return { kind: 'invalid', input, reason: 'Enter a prefix, IP, ASN or set name.' }

  if (input.includes('.') || input.includes(':')) {
    // Try prefix/IP first; set names may contain ':' too, so fall through.
    const prefix = parsePrefix(input)
    if (prefix) {
      return {
        kind: 'prefix',
        prefix,
        cidr: prefix.cidr,
        isHost: !input.includes('/') || prefix.length === maxLength(prefix.version),
      }
    }
  }

  const asn = parseAsn(input)
  if (asn !== null) return { kind: 'asn', asn }

  const set = parseSetName(input)
  if (set) return { kind: 'set', name: set }

  if (/^\d+$/.test(input.replace(/^as/i, ''))) {
    return { kind: 'invalid', input, reason: 'AS number is out of range.' }
  }
  if (input.includes('/') || /^[\d.:a-f]+$/i.test(input)) {
    return { kind: 'invalid', input, reason: 'Not a valid IPv4 or IPv6 prefix.' }
  }
  return {
    kind: 'invalid',
    input,
    reason:
      'Not recognised. Use a prefix (192.0.2.0/24), an IP, an ASN (AS64500) or a set name (AS-EXAMPLE).',
  }
}

export function formatAsn(asn: number): string {
  return `AS${asn}`
}
