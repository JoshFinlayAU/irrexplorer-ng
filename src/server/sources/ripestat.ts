// RIPEstat Data API: per-query BGP detail from RIPE RIS. Used for RIS
// visibility on the prefix view and as the BGP fallback when the bgp.tools
// table is not loaded. Every call carries sourceapp, and responses are
// checked for data_call_status, since RIPEstat can say "ok" with partial data.
import '@tanstack/react-start/server-only'

import { z } from 'zod'
import type { Prefix } from '~/lib/ip'
import type { BgpRow } from '~/lib/analysis/collect'
import { cached } from '../cache'
import { env } from '../env'
import { fetchJson, UpstreamError } from '../http'

const Envelope = z.object({
  status: z.string(),
  data_call_status: z.string().optional(),
  messages: z.array(z.tuple([z.string(), z.string()])).optional(),
  data: z.unknown(),
})

async function call<T extends z.ZodType>(
  name: string,
  params: Record<string, string>,
  schema: T,
): Promise<z.infer<T>> {
  const url = new URL(`/data/${name}/data.json`, env().RIPESTAT_URL)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('sourceapp', env().RIPESTAT_SOURCEAPP)
  const res = await fetchJson('ripestat', url.toString(), Envelope)
  if (res.status !== 'ok')
    throw new UpstreamError('ripestat', `${name} returned status ${res.status}`)
  if (res.data_call_status && !res.data_call_status.startsWith('supported')) {
    throw new UpstreamError('ripestat', `${name} is ${res.data_call_status}`)
  }
  const errors = (res.messages ?? []).filter(([level]) => level === 'error')
  if (errors.length > 0) throw new UpstreamError('ripestat', `${name}: ${errors[0]![1]}`)
  const parsed = schema.safeParse(res.data)
  if (!parsed.success) {
    throw new UpstreamError(
      'ripestat',
      `${name} returned unexpected data (${parsed.error.issues[0]?.message ?? 'invalid'})`,
    )
  }
  return parsed.data
}

const OriginList = z.array(z.object({ origin: z.union([z.number(), z.string()]) }))
const RelatedList = z.array(
  z.object({ prefix: z.string(), origin: z.union([z.number(), z.string()]) }),
)

export const RoutingStatusSchema = z.object({
  first_seen: z
    .object({
      prefix: z.string(),
      origin: z.union([z.number(), z.string()]).nullable(),
      time: z.string(),
    })
    .nullable()
    .optional(),
  last_seen: z
    .object({
      prefix: z.string(),
      origin: z.union([z.number(), z.string()]).nullable(),
      time: z.string(),
    })
    .nullable()
    .optional(),
  visibility: z
    .object({
      v4: z.object({ ris_peers_seeing: z.number(), total_ris_peers: z.number() }),
      v6: z.object({ ris_peers_seeing: z.number(), total_ris_peers: z.number() }),
    })
    .optional(),
  origins: OriginList.optional().default([]),
  less_specifics: RelatedList.optional().default([]),
  more_specifics: RelatedList.optional().default([]),
  resource: z.string(),
  query_time: z.string().optional(),
})
export type RoutingStatus = z.infer<typeof RoutingStatusSchema>

export interface RisVisibility {
  seeing: number
  total: number
  firstSeen: string | null
  lastSeen: string | null
  asOf: string | null
}

const asNumber = (v: number | string | null) => (v === null ? null : Number(v))

export async function routingStatus(p: Prefix): Promise<RoutingStatus> {
  return cached(`ripestat:routing-status:${p.cidr}`, () =>
    call('routing-status', { resource: p.cidr }, RoutingStatusSchema),
  )
}

export function visibilityFrom(p: Prefix, rs: RoutingStatus): RisVisibility | null {
  if (!rs.visibility) return null
  const v = p.version === 4 ? rs.visibility.v4 : rs.visibility.v6
  return {
    seeing: v.ris_peers_seeing,
    total: v.total_ris_peers,
    firstSeen: rs.first_seen?.time ?? null,
    lastSeen: rs.last_seen?.time ?? null,
    asOf: rs.query_time ?? null,
  }
}

/** BGP rows (exact, less and more specific) from RIS, for the fallback path. */
export function bgpRowsFrom(p: Prefix, rs: RoutingStatus): BgpRow[] {
  const rows: BgpRow[] = []
  for (const o of rs.origins) {
    const asn = asNumber(o.origin)
    if (asn !== null && Number.isFinite(asn)) rows.push({ prefix: p.cidr, asn })
  }
  for (const r of [...rs.less_specifics, ...rs.more_specifics]) {
    const asn = asNumber(r.origin)
    if (asn !== null && Number.isFinite(asn)) rows.push({ prefix: r.prefix, asn })
  }
  return rows
}

const RisPrefixesSchema = z.object({
  prefixes: z.object({
    v4: z.object({ originating: z.array(z.string()).optional().default([]) }).optional(),
    v6: z.object({ originating: z.array(z.string()).optional().default([]) }).optional(),
  }),
})

/** Prefixes RIS sees originated by the ASN, for the fallback path. */
export async function originatedByAsn(asn: number): Promise<BgpRow[]> {
  return cached(`ripestat:ris-prefixes:${asn}`, async () => {
    const data = await call(
      'ris-prefixes',
      { resource: `AS${asn}`, list_prefixes: 'true', types: 'o' },
      RisPrefixesSchema,
    )
    const list = [
      ...(data.prefixes.v4?.originating ?? []),
      ...(data.prefixes.v6?.originating ?? []),
    ]
    return list.map((prefix) => ({ prefix, asn }))
  })
}
