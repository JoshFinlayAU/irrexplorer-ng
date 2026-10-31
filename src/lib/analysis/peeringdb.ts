// Small pure helpers for PeeringDB data: reading the free-text IRR AS-set
// field, port speeds, and comparing announcements with max-prefix values.

export interface AsSetRef {
  /** IRR source when written as SOURCE::NAME, else null. */
  source: string | null
  name: string
}

/**
 * PeeringDB's irr_as_set is free text. Networks write "AS-FOO",
 * "RIPE::AS-FOO", "AS-FOO@RIPE" or several of those separated by spaces or
 * commas. Anything that does not look like an AS-set or ASN is dropped.
 */
export function parseIrrAsSet(text: string): AsSetRef[] {
  const out: AsSetRef[] = []
  const seen = new Set<string>()
  for (const token of text.split(/[\s,;]+/)) {
    if (!token) continue
    let source: string | null = null
    let name = token
    const colons = token.indexOf('::')
    if (colons > 0) {
      source = token.slice(0, colons)
      name = token.slice(colons + 2)
    } else if (token.includes('@')) {
      const [n, s] = token.split('@') as [string, string]
      name = n
      source = s || null
    }
    name = name.toUpperCase()
    if (!/^(AS\d+:)*AS-[A-Z0-9_.:-]+$/.test(name) && !/^AS\d+$/.test(name)) continue
    const key = `${source ?? ''}|${name}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ source: source ? source.toUpperCase() : null, name })
  }
  return out
}

/** PeeringDB speeds are Mbit/s: 10000 is "10G", 2400000 is "2.4T". */
export function speedText(mbit: number): string {
  if (mbit >= 1_000_000) return `${+(mbit / 1_000_000).toFixed(1)}T`
  if (mbit >= 1000) return `${+(mbit / 1000).toFixed(1)}G`
  return `${mbit}M`
}

export type MaxPrefixState = 'unset' | 'ok' | 'near' | 'over'

/**
 * Peers often set max-prefix from PeeringDB, so announcing more than the
 * listed value can drop sessions. "near" is above 90% of the limit.
 */
export function maxPrefixState(announced: number, limit: number | null): MaxPrefixState {
  if (!limit) return 'unset'
  if (announced > limit) return 'over'
  if (announced > limit * 0.9) return 'near'
  return 'ok'
}
