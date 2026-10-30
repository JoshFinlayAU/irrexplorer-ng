// RPKI: the full VRP set from the RPKI validator (Routinator's /csv export),
// held in memory and validated locally per RFC 6811. Loading the whole set
// gives both the ROA list per prefix (which the validity endpoint does not)
// and validity for every origin without one HTTP call per (prefix, origin).
import '@tanstack/react-start/server-only'

import { z } from 'zod'
import { maxLength as maxLengthOf, parsePrefixParts, type Prefix, type PrefixParts } from '~/lib/ip'
import { PrefixIndexBuilder, type IndexedRow, type PrefixIndex } from '~/lib/prefix-index'
import { validateOrigin } from '~/lib/analysis/rpki'
import type { RoaRow } from '~/lib/analysis/collect'
import type { Roa, RpkiValidity } from '~/lib/analysis/types'
import { fetchLines, singletonDataset } from '../dataset'
import { env } from '../env'
import { fetchJson } from '../http'

// Pack (asn, maxLength) into one number: asn * 256 + maxLength. Fits well
// inside 2^53 for 32-bit ASNs.
const pack = (asn: number, maxLength: number) => asn * 256 + maxLength
const unpack = (v: number): Roa => ({ asn: Math.floor(v / 256), maxLength: v % 256 })

/** Parse one Routinator CSV line: "ASN,IP Prefix,Max Length,Trust Anchor". */
export function parseVrpLine(line: string): { prefix: PrefixParts; value: number } | null {
  const [asnText, prefixText, maxText] = line.split(',')
  const asn = /^AS(\d+)$/.exec(asnText?.trim() ?? '')
  if (!asn || !prefixText || !maxText) return null
  const prefix = parsePrefixParts(prefixText)
  const maxLength = Number(maxText)
  if (
    !prefix ||
    !Number.isInteger(maxLength) ||
    maxLength < prefix.length ||
    maxLength > maxLengthOf(prefix.version)
  )
    return null
  return { prefix, value: pack(Number(asn[1]), maxLength) }
}

async function loadVrps(): Promise<PrefixIndex> {
  const builder = new PrefixIndexBuilder()
  await fetchLines(`${env().RPKI_VALIDATOR_URL}/csv`, { timeoutMs: 120_000 }, (line) => {
    const row = parseVrpLine(line)
    if (row) builder.add(row.prefix, row.value)
  })
  if (builder.size === 0) throw new Error('RPKI validator returned no VRPs')
  return builder.build({ indexByValue: (v) => Math.floor(v / 256) })
}

export const vrps = singletonDataset<PrefixIndex>({
  name: 'RPKI VRPs',
  source: 'rpki',
  refreshSeconds: env().RPKI_REFRESH_SECONDS,
  retrySeconds: 60,
  enabled: () => env().BULK_DATASETS_ENABLED,
  load: loadVrps,
  size: (index) => index.size,
})

const toRoa = (rows: IndexedRow[]): RoaRow[] =>
  rows.map((r) => ({ prefix: r.prefix.cidr, ...unpack(r.value) }))

export function roasOverlapping(p: Prefix): RoaRow[] | null {
  const index = vrps.get()
  return index ? toRoa(index.overlapping(p)) : null
}

export function roasByOrigin(asn: number): RoaRow[] | null {
  const index = vrps.get()
  return index ? toRoa(index.withValueKey(asn)) : null
}

/** A validator bound to the currently loaded VRPs, or null when unavailable. */
export function validator(): ((p: Prefix, asn: number) => RpkiValidity) | null {
  const index = vrps.get()
  if (!index) return null
  return (p, asn) => {
    const covering = [...index.lessSpecific(p), ...index.exact(p)].map((r) => unpack(r.value))
    return validateOrigin(p.length, asn, covering)
  }
}

const StatusSchema = z.object({
  version: z.string().optional(),
  lastUpdateDone: z.string().nullable().optional(),
  lastUpdateStart: z.string().nullable().optional(),
})

/** Validator metadata for the status page. */
export async function validatorStatus(): Promise<z.infer<typeof StatusSchema>> {
  return fetchJson('rpki', `${env().RPKI_VALIDATOR_URL}/api/v1/status`, StatusSchema)
}
