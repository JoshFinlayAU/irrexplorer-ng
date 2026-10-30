// JSON API compatible with the original IRR Explorer's /api endpoints, so
// existing tools (irrexplorer-cli, roach) and the "Source data as JSON" links
// keep working. Each summary also carries the richer NG data under "ng".
import '@tanstack/react-start/server-only'

import { classifyQuery, formatAsn, setType } from '~/lib/parse'
import { parsePrefix, prefixSortKey } from '~/lib/ip'
import { env } from '../env'
import type { PrefixSummary, RpkiValidity } from '~/lib/analysis/types'

const RPKI_STATUS: Record<RpkiValidity['state'], string> = {
  valid: 'VALID',
  invalid: 'INVALID',
  'not-found': 'NOT_FOUND',
  unknown: 'UNKNOWN',
}

export function toCompatSummary(s: PrefixSummary) {
  const p = parsePrefix(s.prefix)
  return {
    prefix: s.prefix,
    rir: s.rir,
    bgpOrigins: s.bgpOrigins.map((o) => o.asn),
    rpkiRoutes: s.rpkiRoutes.map((r) => ({
      asn: r.asn,
      rpslText: null,
      rpslPk: `${s.prefix}AS${r.asn}/ML${r.maxLength}`,
      rpkiStatus: 'VALID',
      rpkiMaxLength: r.maxLength,
    })),
    irrRoutes: Object.fromEntries(
      Object.entries(s.irrRoutes).map(([source, list]) => [
        source,
        list.map((r) => ({
          asn: r.asn,
          rpslText: null,
          rpslPk: r.rpslPk,
          rpkiStatus: RPKI_STATUS[r.rpki.state],
          rpkiMaxLength: null,
        })),
      ]),
    ),
    messages: s.messages,
    categoryOverall: s.categoryOverall,
    goodnessOverall: s.goodnessOverall,
    prefixSortKeyIpPrefix: p ? prefixSortKey(p) : s.prefix,
    prefixSortKeyReverseNetworklenIp: p
      ? `${(128 - p.length).toString().padStart(3, '0')}-${prefixSortKey(p)}`
      : s.prefix,
    ng: s,
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    },
  })
}

export function text(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' },
  })
}

export function cleanQuery(
  raw: string,
): { category: string; cleanedValue: string } | { error: string } {
  const q = classifyQuery(raw)
  switch (q.kind) {
    case 'invalid':
      return { error: q.reason }
    case 'asn':
      return { category: 'asn', cleanedValue: formatAsn(q.asn) }
    case 'prefix': {
      const min = q.prefix.version === 4 ? env().MIN_PREFIX_LENGTH_V4 : env().MIN_PREFIX_LENGTH_V6
      if (q.prefix.length < min)
        return { error: `Query too large: the minimum prefix length is ${min}.` }
      return { category: 'prefix', cleanedValue: q.isHost ? q.cidr.replace(/\/\d+$/, '') : q.cidr }
    }
    case 'set':
      return { category: setType(q.name), cleanedValue: q.name }
  }
}
