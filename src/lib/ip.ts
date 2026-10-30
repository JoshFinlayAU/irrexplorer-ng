// IPv4/IPv6 address and prefix helpers. Everything works on bigint so both
// families share one code path. Never compare prefixes as strings.

export type IpVersion = 4 | 6

export interface Prefix {
  version: IpVersion
  /** Network address with host bits zeroed. */
  network: bigint
  length: number
  /** Canonical text form, e.g. "192.0.2.0/24" or "2001:db8::/32". */
  cidr: string
}

const BITS: Record<IpVersion, number> = { 4: 32, 6: 128 }

export function maxLength(version: IpVersion): number {
  return BITS[version]
}

function parseIpv4(text: string): bigint | null {
  const parts = text.split('.')
  if (parts.length !== 4) return null
  let value = 0n
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const n = Number(part)
    if (n > 255) return null
    value = (value << 8n) | BigInt(n)
  }
  return value
}

function parseIpv6(text: string): bigint | null {
  if (!/^[0-9a-fA-F:.]+$/.test(text)) return null
  const halves = text.split('::')
  if (halves.length > 2) return null

  const toGroups = (part: string): number[] | null => {
    if (part === '') return []
    const out: number[] = []
    const pieces = part.split(':')
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i] ?? ''
      if (piece.includes('.')) {
        // Embedded IPv4 is only allowed as the final piece.
        if (i !== pieces.length - 1) return null
        const v4 = parseIpv4(piece)
        if (v4 === null) return null
        out.push(Number(v4 >> 16n), Number(v4 & 0xffffn))
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) return null
        out.push(parseInt(piece, 16))
      }
    }
    return out
  }

  const head = toGroups(halves[0] ?? '')
  const tail = halves.length === 2 ? toGroups(halves[1] ?? '') : []
  if (head === null || tail === null) return null

  let groups: number[]
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length
    if (missing < 1) return null
    groups = [...head, ...new Array<number>(missing).fill(0), ...tail]
  } else {
    groups = head
  }
  if (groups.length !== 8) return null

  let value = 0n
  for (const g of groups) value = (value << 16n) | BigInt(g)
  return value
}

/** Parse a bare IP address. Returns null when it is not a valid address. */
export function parseIp(text: string): { version: IpVersion; value: bigint } | null {
  const trimmed = text.trim()
  if (trimmed.includes(':')) {
    const value = parseIpv6(trimmed)
    return value === null ? null : { version: 6, value }
  }
  const value = parseIpv4(trimmed)
  return value === null ? null : { version: 4, value }
}

function formatIpv4(value: bigint): string {
  return [24n, 16n, 8n, 0n].map((shift) => String((value >> shift) & 0xffn)).join('.')
}

/** RFC 5952 canonical text: lowercase, no leading zeros, longest zero run compressed. */
function formatIpv6(value: bigint): string {
  const groups: number[] = []
  for (let i = 7; i >= 0; i--) groups.push(Number((value >> BigInt(i * 16)) & 0xffffn))

  let bestStart = -1
  let bestLen = 0
  for (let i = 0; i < 8;) {
    if (groups[i] !== 0) {
      i++
      continue
    }
    let j = i
    while (j < 8 && groups[j] === 0) j++
    if (j - i > bestLen) {
      bestStart = i
      bestLen = j - i
    }
    i = j
  }

  const hex = groups.map((g) => g.toString(16))
  if (bestLen < 2) return hex.join(':')
  const left = hex.slice(0, bestStart).join(':')
  const right = hex.slice(bestStart + bestLen).join(':')
  return `${left}::${right}`
}

export function formatIp(version: IpVersion, value: bigint): string {
  return version === 4 ? formatIpv4(value) : formatIpv6(value)
}

function hostMask(version: IpVersion, length: number): bigint {
  return (1n << BigInt(BITS[version] - length)) - 1n
}

/** Build a prefix from an address and length, zeroing the host bits. */
export function makePrefix(version: IpVersion, address: bigint, length: number): Prefix {
  const network = address & ~hostMask(version, length) & ((1n << BigInt(BITS[version])) - 1n)
  return { version, network, length, cidr: `${formatIp(version, network)}/${length}` }
}

export type PrefixParts = Omit<Prefix, 'cidr'>

/** Like parsePrefix but skips building the text form. For bulk loading. */
export function parsePrefixParts(text: string): PrefixParts | null {
  const trimmed = text.trim()
  const slash = trimmed.indexOf('/')
  const addrText = slash === -1 ? trimmed : trimmed.slice(0, slash)
  const ip = parseIp(addrText)
  if (!ip) return null
  let length = BITS[ip.version]
  if (slash !== -1) {
    const lenText = trimmed.slice(slash + 1)
    if (!/^\d{1,3}$/.test(lenText)) return null
    length = Number(lenText)
    if (length > BITS[ip.version]) return null
  }
  const network = ip.value & ~hostMask(ip.version, length) & ((1n << BigInt(BITS[ip.version])) - 1n)
  return { version: ip.version, network, length }
}

/**
 * Parse "addr/len" into a canonical prefix. Host bits are zeroed. A bare
 * address is treated as a host prefix (/32 or /128).
 */
export function parsePrefix(text: string): Prefix | null {
  const parts = parsePrefixParts(text)
  if (!parts) return null
  return { ...parts, cidr: `${formatIp(parts.version, parts.network)}/${parts.length}` }
}

export function lastAddress(p: Prefix): bigint {
  return p.network | hostMask(p.version, p.length)
}

/** True when `outer` covers `inner` (equal prefixes count as covering). */
export function covers(outer: Prefix, inner: Prefix): boolean {
  if (outer.version !== inner.version || outer.length > inner.length) return false
  return (inner.network & ~hostMask(outer.version, outer.length)) === outer.network
}

export function samePrefix(a: Prefix, b: Prefix): boolean {
  return a.version === b.version && a.length === b.length && a.network === b.network
}

/** Sort order: family, then network address, then length (shorter first). */
export function comparePrefixes(a: Prefix, b: Prefix): number {
  if (a.version !== b.version) return a.version - b.version
  if (a.network !== b.network) return a.network < b.network ? -1 : 1
  return a.length - b.length
}

/** Compare two CIDR strings by address order. Unparseable values sort last. */
export function compareCidr(a: string, b: string): number {
  const pa = parsePrefix(a)
  const pb = parsePrefix(b)
  if (!pa || !pb) return pa ? -1 : pb ? 1 : a.localeCompare(b)
  return comparePrefixes(pa, pb)
}

/** Every prefix that covers `p`, from /0 up to and including `p` itself. */
export function coveringPrefixes(p: Prefix): Prefix[] {
  const out: Prefix[] = []
  for (let len = 0; len <= p.length; len++) out.push(makePrefix(p.version, p.network, len))
  return out
}

/** Fixed-width sort key so lexical order equals address order within a family. */
export function prefixSortKey(p: PrefixParts): string {
  const width = p.version === 4 ? 8 : 32
  return `${p.version}${p.network.toString(16).padStart(width, '0')}${p.length.toString(16).padStart(2, '0')}`
}

/** Number of addresses, for display ("2^n" style sizes are left to the UI). */
export function prefixSize(p: Prefix): bigint {
  return 1n << BigInt(BITS[p.version] - p.length)
}
