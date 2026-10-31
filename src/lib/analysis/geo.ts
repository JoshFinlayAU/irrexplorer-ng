// Where a prefix's addresses are, from GeoLite2. A prefix can span many
// GeoLite2 networks, so it is walked network by network and each country's
// share is weighted by address count. Prefixes spanning more networks than
// the step budget are sampled at evenly spaced addresses instead.
import {
  comparePrefixes,
  covers,
  formatIp,
  lastAddress,
  maxLength,
  prefixSize,
  type Prefix,
} from '../ip'
import type { GeoBreakdown, GeoCountry, GeoPlace, PrefixGeo } from './types'

/** The subset of a GeoLite2 City or Country record that is read. */
export interface GeoRecord {
  country?: { iso_code?: string; names?: Record<string, string> }
  registered_country?: { iso_code?: string; names?: Record<string, string> }
  city?: { names?: Record<string, string> }
  subdivisions?: { names?: Record<string, string> }[]
  location?: { latitude?: number; longitude?: number; accuracy_radius?: number }
}

/** mmdb-lib's getWithPrefixLength: the record and the length of its network. */
export type GeoLookup = (ip: string) => [GeoRecord | null, number]

export interface GeoOptions {
  /** Most networks to walk before falling back to sampling. */
  maxSteps?: number
  samples?: number
  /** Countries listed before the rest are folded into "other". */
  maxCountries?: number
  /** Include city-level detail when one network covers the whole prefix. */
  place?: boolean
}

const SCALE = 1_000_000n

function ratio(part: bigint, total: bigint): number {
  return Number((part * SCALE) / total) / Number(SCALE)
}

export function placeOf(rec: GeoRecord): GeoPlace {
  return {
    city: rec.city?.names?.en ?? null,
    region: rec.subdivisions?.[0]?.names?.en ?? null,
    country: rec.country?.iso_code ?? null,
    countryName: rec.country?.names?.en ?? null,
    registered: rec.registered_country?.iso_code ?? null,
    registeredName: rec.registered_country?.names?.en ?? null,
    latitude: rec.location?.latitude ?? null,
    longitude: rec.location?.longitude ?? null,
    radiusKm: rec.location?.accuracy_radius ?? null,
  }
}

export function geoOfPrefix(p: Prefix, lookup: GeoLookup, options: GeoOptions = {}): PrefixGeo {
  const maxSteps = options.maxSteps ?? 64
  const samples = options.samples ?? 128
  const maxCountries = options.maxCountries ?? 4
  const bits = maxLength(p.version)
  const total = prefixSize(p)
  const end = lastAddress(p)

  const tally = new Map<string, { name: string; count: bigint }>()
  let unknown = 0n
  const add = (rec: GeoRecord | null, count: bigint) => {
    const code = rec?.country?.iso_code
    if (!code) {
      unknown += count
      return
    }
    const t = tally.get(code)
    if (t) t.count += count
    else tally.set(code, { name: rec.country?.names?.en ?? code, count })
  }

  let cur = p.network
  let steps = 0
  let first: GeoRecord | null = null
  while (cur <= end && steps < maxSteps) {
    const [rec, len] = lookup(formatIp(p.version, cur))
    const netLen = Math.min(Math.max(len, p.length), bits)
    const size = 1n << BigInt(bits - netLen)
    const start = cur & ~(size - 1n)
    const next = start + size
    const stop = next - 1n > end ? end + 1n : next
    add(rec, stop - cur)
    if (steps === 0) first = rec
    cur = next
    steps++
  }

  const estimated = cur <= end
  if (estimated) {
    tally.clear()
    unknown = 0n
    // One lookup at the middle of each equal slice, each weighted the same.
    const n = total < BigInt(samples) ? total : BigInt(samples)
    for (let i = 0n; i < n; i++) {
      const [rec] = lookup(formatIp(p.version, p.network + (total * (2n * i + 1n)) / (2n * n)))
      add(rec, total / n)
    }
    unknown += total - (total / n) * n
  }

  const sorted = [...tally.entries()]
    .map(([code, t]) => ({ code, name: t.name, count: t.count }))
    .sort((a, b) =>
      a.count === b.count ? a.code.localeCompare(b.code) : a.count > b.count ? -1 : 1,
    )
  const listed = sorted.slice(0, maxCountries)
  const rest = sorted.slice(maxCountries).reduce((a, c) => a + c.count, 0n)
  const countries: GeoCountry[] = listed.map((c) => ({
    code: c.code,
    name: c.name,
    share: ratio(c.count, total),
  }))

  return {
    countries,
    other: ratio(rest, total),
    unknown: ratio(unknown, total),
    networks: steps,
    estimated,
    place: options.place && steps === 1 && !estimated && first ? placeOf(first) : null,
  }
}

/** Combine per-prefix results, weighting each by its address count. */
export function mergeGeo(
  parts: readonly { prefix: Prefix; geo: PrefixGeo }[],
  maxCountries = 6,
): GeoBreakdown | null {
  if (parts.length === 0) return null
  // Weigh in a common unit: addresses for IPv4, /64s for IPv6. Families are
  // kept apart because a single IPv6 /32 would otherwise swamp all of IPv4.
  const byFamily = (version: 4 | 6) => parts.filter((x) => x.prefix.version === version)
  const v4 = byFamily(4)
  // Count each address once: a more specific inside another listed prefix is dropped.
  const use: { prefix: Prefix; geo: PrefixGeo }[] = []
  for (const part of [...(v4.length > 0 ? v4 : byFamily(6))].sort((a, b) =>
    comparePrefixes(a.prefix, b.prefix),
  )) {
    const last = use[use.length - 1]
    if (!last || !covers(last.prefix, part.prefix)) use.push(part)
  }
  const weight = (p: Prefix) =>
    p.version === 4 ? prefixSize(p) : p.length >= 64 ? 1n : 1n << BigInt(64 - p.length)
  const scale = 1_000_000n
  let total = 0n
  let unknown = 0n
  const tally = new Map<string, { name: string; w: bigint }>()
  for (const { prefix, geo } of use) {
    const w = weight(prefix)
    total += w
    unknown += (w * BigInt(Math.round(geo.unknown * 1e6))) / scale
    for (const c of geo.countries) {
      const cw = (w * BigInt(Math.round(c.share * 1e6))) / scale
      const t = tally.get(c.code)
      if (t) t.w += cw
      else tally.set(c.code, { name: c.name, w: cw })
    }
  }
  if (total === 0n) return null
  const sorted = [...tally.entries()].sort((a, b) =>
    a[1].w === b[1].w ? 0 : a[1].w > b[1].w ? -1 : 1,
  )
  const countries = sorted
    .slice(0, maxCountries)
    .map(([code, t]) => ({ code, name: t.name, share: ratio(t.w, total) }))
  const listedShare = countries.reduce((a, c) => a + c.share, 0)
  const unknownShare = ratio(unknown, total)
  return {
    countries,
    other: Math.max(0, 1 - listedShare - unknownShare),
    unknown: unknownShare,
  }
}
