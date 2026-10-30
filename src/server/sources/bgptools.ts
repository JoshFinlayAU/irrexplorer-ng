// bgp.tools: the global table dump (table.jsonl) and AS names (asns.csv),
// both downloaded on a schedule and indexed in memory. bgp.tools asks for no
// more than one download per 30 minutes and an identifying User-Agent, and
// prefers this over per-request scraping. https://bgp.tools/kb/api
import '@tanstack/react-start/server-only'

import { parsePrefixParts, type Prefix, type PrefixParts } from '~/lib/ip'
import { PrefixIndexBuilder, type IndexedRow, type PrefixIndex } from '~/lib/prefix-index'
import type { BgpRow } from '~/lib/analysis/collect'
import { fetchLines, singletonDataset } from '../dataset'
import { env } from '../env'

function headers(): Record<string, string> {
  const ua = env().BGPTOOLS_USER_AGENT
  if (!ua) throw new Error('BGPTOOLS_USER_AGENT is not set; bgp.tools refuses generic clients')
  return { 'user-agent': ua }
}

/**
 * Parse one table.jsonl line, applying the original's hit and length filters.
 * Validation is hand-rolled rather than Zod because this runs 1.5M times.
 */
export function parseTableLine(
  line: string,
  minHits: number,
): { prefix: PrefixParts; asn: number } | null {
  if (!line) return null
  let json: unknown
  try {
    json = JSON.parse(line)
  } catch {
    return null
  }
  if (typeof json !== 'object' || json === null) return null
  const { CIDR, ASN, Hits } = json as Record<string, unknown>
  if (typeof CIDR !== 'string' || typeof ASN !== 'number' || typeof Hits !== 'number') return null
  if (!Number.isInteger(ASN) || ASN < 0 || ASN > 4294967295 || Hits < minHits) return null
  const prefix = parsePrefixParts(CIDR)
  if (!prefix) return null
  if (prefix.version === 4 ? prefix.length >= 29 : prefix.length >= 124) return null
  return { prefix, asn: ASN }
}

async function loadTable(): Promise<PrefixIndex> {
  const builder = new PrefixIndexBuilder()
  const minHits = env().BGPTOOLS_MIN_HITS
  await fetchLines(
    `${env().BGPTOOLS_URL}/table.jsonl`,
    {
      headers: headers(),
      timeoutMs: 300_000,
      cache: { name: 'bgptools-table', maxAgeSeconds: 1800 },
    },
    (line) => {
      const row = parseTableLine(line, minHits)
      if (row) builder.add(row.prefix, row.asn)
    },
  )
  if (builder.size === 0) throw new Error('bgp.tools table dump was empty')
  return builder.build({ indexByValue: (v) => v })
}

/** Minimal CSV field splitter that understands double-quoted fields. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line.charAt(i)
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      out.push(field)
      field = ''
    } else field += c
  }
  out.push(field)
  return out
}

async function loadNames(): Promise<Map<number, string>> {
  const names = new Map<number, string>()
  const options = {
    headers: headers(),
    timeoutMs: 120_000,
    cache: { name: 'bgptools-asns', maxAgeSeconds: 86400 },
  }
  await fetchLines(`${env().BGPTOOLS_URL}/asns.csv`, options, (line) => {
    const [asn, name] = splitCsvLine(line)
    const m = asn ? /^AS(\d+)$/.exec(asn) : null
    if (m && name) names.set(Number(m[1]), name)
  })
  if (names.size === 0) throw new Error('bgp.tools asns.csv was empty')
  return names
}

export const bgpTable = singletonDataset<PrefixIndex>({
  name: 'bgp.tools table',
  source: 'bgptools',
  refreshSeconds: env().BGPTOOLS_REFRESH_SECONDS,
  retrySeconds: 1800,
  enabled: () => env().BULK_DATASETS_ENABLED && env().BGPTOOLS_ENABLED,
  load: loadTable,
  size: (index) => index.size,
})

export const asNames = singletonDataset<Map<number, string>>({
  name: 'bgp.tools AS names',
  source: 'bgptools',
  refreshSeconds: 86400,
  retrySeconds: 3600,
  enabled: () => env().BULK_DATASETS_ENABLED && env().BGPTOOLS_ENABLED,
  load: loadNames,
  size: (names) => names.size,
})

const toBgp = (rows: IndexedRow[]): BgpRow[] =>
  rows.map((r) => ({ prefix: r.prefix.cidr, asn: r.value }))

/** BGP rows overlapping the prefix, or null when the table is not loaded. */
export function bgpOverlapping(p: Prefix): BgpRow[] | null {
  const index = bgpTable.get()
  return index ? toBgp(index.overlapping(p)) : null
}

export function bgpByOrigin(asn: number): BgpRow[] | null {
  const index = bgpTable.get()
  return index ? toBgp(index.withValueKey(asn)) : null
}

export function asName(asn: number): string | null {
  return asNames.get()?.get(asn) ?? null
}
