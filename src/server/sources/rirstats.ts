// Prefix to RIR mapping from the NRO combined delegated stats file plus the
// Registro.BR (NIR) allocation list, the same inputs the original used.
import '@tanstack/react-start/server-only'

import { makePrefix, parseIp, parsePrefix, type Prefix } from '~/lib/ip'
import { PrefixIndexBuilder, type IndexedRow, type PrefixIndex } from '~/lib/prefix-index'
import type { RirRow } from '~/lib/analysis/collect'
import type { RirName } from '~/lib/analysis/types'
import { fetchLines, singletonDataset } from '../dataset'
import { env } from '../env'

export const RIRS: readonly RirName[] = [
  'RIPE NCC',
  'ARIN',
  'AFRINIC',
  'LACNIC',
  'APNIC',
  'Registro.BR',
]
const REGISTRY: Record<string, RirName> = {
  ripencc: 'RIPE NCC',
  arin: 'ARIN',
  afrinic: 'AFRINIC',
  lacnic: 'LACNIC',
  apnic: 'APNIC',
}

/** Split an IPv4 range (start + address count) into the minimal set of CIDRs. */
export function rangeToCidrs(start: bigint, count: bigint): Prefix[] {
  const out: Prefix[] = []
  let cur = start
  let left = count
  while (left > 0n) {
    let len = 32
    // Grow the block while it stays aligned and fits in what is left.
    while (len > 0) {
      const size = 1n << BigInt(32 - (len - 1))
      if (cur % size !== 0n || size > left) break
      len--
    }
    out.push(makePrefix(4, cur, len))
    const size = 1n << BigInt(32 - len)
    cur += size
    left -= size
  }
  return out
}

/** Parse one NRO delegated-stats line (registry|cc|type|start|value|date|status|...). */
export function parseDelegatedLine(line: string): IndexedRow[] {
  const f = line.split('|')
  if (f.length < 7) return []
  const rir = REGISTRY[f[0] ?? '']
  const status = f[6]
  if (!rir || (status !== 'allocated' && status !== 'assigned')) return []
  const value = RIRS.indexOf(rir)
  if (f[2] === 'ipv4') {
    const ip = parseIp(f[3] ?? '')
    if (!ip || ip.version !== 4 || !/^\d+$/.test(f[4] ?? '')) return []
    const count = BigInt(f[4]!)
    if (count <= 0n) return []
    return rangeToCidrs(ip.value, count).map((prefix) => ({ prefix, value }))
  }
  if (f[2] === 'ipv6') {
    const prefix = parsePrefix(`${f[3] ?? ''}/${f[4] ?? ''}`)
    return prefix ? [{ prefix, value }] : []
  }
  return []
}

/** One Registro.BR line: AS|name|document|prefix|prefix|... */
export function parseRegistroBrLine(line: string): IndexedRow[] {
  const value = RIRS.indexOf('Registro.BR')
  return line
    .split('|')
    .slice(3)
    .flatMap((field) => {
      const prefix = field.includes('/') ? parsePrefix(field) : null
      return prefix ? [{ prefix, value }] : []
    })
}

async function load(): Promise<PrefixIndex> {
  const builder = new PrefixIndexBuilder()
  const add = (rows: IndexedRow[]) => {
    for (const r of rows) builder.add(r.prefix, r.value)
  }
  const day = { maxAgeSeconds: 86400 }
  await Promise.all([
    fetchLines(
      env().RIRSTATS_URL,
      { timeoutMs: 300_000, cache: { name: 'nro-delegated', ...day } },
      (l) => add(parseDelegatedLine(l)),
    ),
    fetchLines(
      env().REGISTROBR_URL,
      { timeoutMs: 120_000, cache: { name: 'registrobr', ...day } },
      (l) => add(parseRegistroBrLine(l)),
    ).catch((err: unknown) => {
      // Registro.BR is a refinement; carry on with the RIR data alone.
      console.warn(
        `[dataset] Registro.BR failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }),
  ])
  if (builder.size === 0) throw new Error('RIR delegated stats were empty')
  return builder.build()
}

export const rirStats = singletonDataset<PrefixIndex>({
  name: 'RIR delegations',
  source: 'rirstats',
  refreshSeconds: env().RIRSTATS_REFRESH_SECONDS,
  retrySeconds: 600,
  enabled: () => env().BULK_DATASETS_ENABLED,
  load,
  size: (index) => index.size,
})

export function rirOverlapping(p: Prefix): RirRow[] | null {
  const index = rirStats.get()
  if (!index) return null
  return index
    .overlapping(p)
    .map((r) => ({ prefix: r.prefix.cidr, rir: RIRS[r.value] ?? 'RIPE NCC' }))
}
