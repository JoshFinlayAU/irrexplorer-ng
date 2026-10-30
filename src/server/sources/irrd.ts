// IRRd GraphQL client. Every query passes explicit RPKI statuses so that
// RPKI-invalid route objects are not filtered out by IRRd's ROV filter, and
// set expansion always passes a depth.
import '@tanstack/react-start/server-only'

import { z } from 'zod'
import type { Prefix } from '~/lib/ip'
import type { IrrRow } from '~/lib/analysis/collect'
import type { SetLevelResult } from '~/lib/analysis/sets'
import { cached } from '../cache'
import { env } from '../env'
import { failed, fetchJson } from '../http'

const ALL_RPKI = '[valid, invalid, not_found]'
/** How many aliased lookups go into one GraphQL request. */
const BATCH = 40
const CONCURRENCY = 4

const GraphQlResponse = z.object({
  data: z.record(z.string(), z.unknown()).nullable().optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
})

async function graphql(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const res = await fetchJson('irrd', env().IRRD_GRAPHQL_URL, GraphQlResponse, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    timeoutMs: Math.max(env().UPSTREAM_TIMEOUT_MS, 15000),
  })
  // A 200 carrying GraphQL errors still counts as a failed call for health.
  if (res.errors?.length) throw failed('irrd', `GraphQL error: ${res.errors[0]!.message}`)
  if (!res.data) throw failed('irrd', 'GraphQL response had no data')
  return res.data
}

export const RouteObjectSchema = z.object({
  rpslPk: z.string(),
  source: z.string(),
  prefix: z.string().nullable().optional(),
  asn: z.number().int().nullable().optional(),
})
const RouteList = z.array(RouteObjectSchema)

/**
 * IRRd serves ROAs as route objects in a pseudo-source "RPKI". ROAs come
 * from the validator here, so those are dropped (the original also never
 * showed RPKI as an IRR column).
 */
export const RPKI_PSEUDO_SOURCE = 'RPKI'

const toIrrRows = (list: z.infer<typeof RouteList>): IrrRow[] =>
  list.flatMap((o) =>
    o.prefix && o.source.toUpperCase() !== RPKI_PSEUDO_SOURCE
      ? [{ prefix: o.prefix, asn: o.asn ?? 0, source: o.source, rpslPk: o.rpslPk }]
      : [],
  )

const ROUTE_FIELDS =
  '{ rpslPk source ... on RPSLRoute { prefix asn } ... on RPSLRoute6 { prefix asn } }'

/** route/route6 objects exact, less and more specific of each prefix. */
export async function routesOverlapping(prefixes: readonly Prefix[]): Promise<IrrRow[]> {
  const batches: Prefix[][] = []
  for (let i = 0; i < prefixes.length; i += BATCH) batches.push(prefixes.slice(i, i + BATCH))
  const runBatch = (batch: Prefix[]) =>
    cached(`irrd:overlap:${batch.map((p) => p.cidr).join(',')}`, async () => {
      const vars: Record<string, string> = {}
      const defs: string[] = []
      const fields = batch.map((p, j) => {
        vars[`p${j}`] = p.cidr
        defs.push(`$p${j}: IP!`)
        const cls = p.version === 4 ? 'route' : 'route6'
        return `q${j}: rpslObjects(ipAny: $p${j}, objectClass: ["${cls}"], rpkiStatus: ${ALL_RPKI}) ${ROUTE_FIELDS}`
      })
      const data = await graphql(`query(${defs.join(', ')}) { ${fields.join('\n')} }`, vars)
      return batch.flatMap((_, j) => toIrrRows(RouteList.parse(data[`q${j}`] ?? [])))
    })
  // A few batches in flight at once; large ASNs can need dozens.
  const results: IrrRow[][] = new Array<IrrRow[]>(batches.length)
  let next = 0
  const worker = async () => {
    while (next < batches.length) {
      const i = next++
      results[i] = await runBatch(batches[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker))
  return results.flat()
}

/** Every route/route6 object with this origin. */
export async function routesByOrigin(asn: number): Promise<IrrRow[]> {
  return cached(`irrd:origin:${asn}`, async () => {
    const data = await graphql(
      `query($asn: [ASN!]) { r: rpslObjects(asn: $asn, objectClass: ["route", "route6"], rpkiStatus: ${ALL_RPKI}) ${ROUTE_FIELDS} }`,
      { asn: [asn] },
    )
    return toIrrRows(RouteList.parse(data['r'] ?? []))
  })
}

const SetMembersSchema = z.array(
  z.object({ rpslPk: z.string(), rootSource: z.string(), members: z.array(z.string()) }),
)

/** One level of set expansion for many names at once. */
export async function setLevel(names: string[]): Promise<SetLevelResult[]> {
  if (names.length === 0) return []
  return cached(`irrd:setlevel:${names.join(',')}`, async () => {
    const data = await graphql(
      'query($names: [String!]!) { s: recursiveSetMembers(setNames: $names, depth: 1) { rpslPk rootSource members } }',
      { names },
    )
    return SetMembersSchema.parse(data['s'] ?? []).map((s) => ({
      name: s.rpslPk,
      source: s.rootSource,
      members: s.members,
    }))
  })
}

const PkSourceList = z.array(z.object({ rpslPk: z.string(), source: z.string() }))
const AutNumList = z.array(
  z.object({
    source: z.string(),
    memberOf: z.array(z.string()).nullable().optional(),
    mntBy: z.array(z.string()).nullable().optional(),
  }),
)
const AsSetRefList = z.array(
  z.object({
    rpslPk: z.string(),
    source: z.string(),
    mbrsByRef: z.array(z.string()).nullable().optional(),
  }),
)

export interface MemberOfRow {
  name: string
  source: string
}

/**
 * Sets that include the target. For as-sets and an ASN target this also
 * honours aut-num member-of where the set's mbrs-by-ref allows it.
 */
export async function memberOf(
  target: string,
  objectClass: 'as-set' | 'route-set',
): Promise<MemberOfRow[]> {
  const member = /^\d+$/.test(target) ? `AS${target}` : target.toUpperCase()
  return cached(`irrd:memberof:${objectClass}:${member}`, async () => {
    const data = await graphql(
      'query($m: [String!], $cls: [String!]) { d: rpslObjects(members: $m, objectClass: $cls) { rpslPk source } }',
      { m: [member], cls: [objectClass] },
    )
    const rows: MemberOfRow[] = PkSourceList.parse(data['d'] ?? []).map((r) => ({
      name: r.rpslPk,
      source: r.source,
    }))

    const asn = /^AS(\d+)$/.exec(member)
    if (objectClass === 'as-set' && asn) {
      const aut = await graphql(
        'query($pk: [String!]) { a: rpslObjects(rpslPk: $pk, objectClass: ["aut-num"]) { source ... on RPSLAutNum { memberOf mntBy } } }',
        { pk: [member] },
      )
      const autNums = AutNumList.parse(aut['a'] ?? [])
      const wanted = [
        ...new Set(autNums.flatMap((a) => a.memberOf ?? []).map((s) => s.toUpperCase())),
      ]
      if (wanted.length > 0) {
        const mntBy = new Set(autNums.flatMap((a) => a.mntBy ?? []).map((m) => m.toUpperCase()))
        const sets = await graphql(
          'query($pk: [String!]) { s: rpslObjects(rpslPk: $pk, objectClass: ["as-set"]) { rpslPk source ... on RPSLAsSet { mbrsByRef } } }',
          { pk: wanted },
        )
        for (const s of AsSetRefList.parse(sets['s'] ?? [])) {
          const refs = (s.mbrsByRef ?? []).map((m) => m.toUpperCase())
          if (refs.includes('ANY') || refs.some((m) => mntBy.has(m))) {
            rows.push({ name: s.rpslPk, source: s.source })
          }
        }
      }
    }
    const seen = new Set<string>()
    return rows.filter((r) => {
      const k = `${r.name}|${r.source}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  })
}

const ObjectTextList = z.array(
  z.object({ rpslPk: z.string(), source: z.string(), objectText: z.string() }),
)

/** Full RPSL text of one object, for the whois view. */
export async function objectText(
  rpslPk: string,
  source: string,
  objectClass: string,
): Promise<string | null> {
  return cached(`irrd:text:${objectClass}:${source}:${rpslPk}`, async () => {
    const data = await graphql(
      `query($pk: [String!], $src: [String!], $cls: [String!]) { o: rpslObjects(rpslPk: $pk, sources: $src, objectClass: $cls, rpkiStatus: ${ALL_RPKI}) { rpslPk source objectText } }`,
      { pk: [rpslPk], src: [source], cls: [objectClass] },
    )
    return ObjectTextList.parse(data['o'] ?? [])[0]?.objectText ?? ''
  }).then((t) => (t === '' ? null : t))
}

export const DatabaseStatusSchema = z.array(
  z.object({
    source: z.string(),
    authoritative: z.boolean().nullable().optional(),
    rpkiRovFilter: z.boolean().nullable().optional(),
    lastUpdate: z.string().nullable().optional(),
  }),
)

export async function databaseStatus(): Promise<z.infer<typeof DatabaseStatusSchema>> {
  return cached(
    'irrd:status',
    async () => {
      const data = await graphql(
        '{ s: databaseStatus { source authoritative rpkiRovFilter lastUpdate } }',
      )
      return DatabaseStatusSchema.parse(data['s'] ?? [])
    },
    60,
  )
}
