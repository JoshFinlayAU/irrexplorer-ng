import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { AddressMap } from '~/components/address-map'
import { Explanation } from '~/components/explanation'
import { Findings } from '~/components/findings'
import { SourceNotices } from '~/components/notices'
import { ReportTables, useReportUpdate, type TableSpec } from '~/components/report-tables'
import { InvalidQuery, Pending } from '~/components/route-states'
import { GeoPlaceView, GeoShares, geoMissingText } from '~/components/geo'
import { RpkiWord } from '~/components/status'
import { FactStrip, Meter, PageTitle, type Fact } from '~/components/ui'
import { classifyQuery } from '~/lib/parse'
import { locationFor } from '~/lib/links'
import { prefixQuery } from '~/lib/queries'
import { useRecordRecent } from '~/lib/recent'
import { reportSearchSchema } from '~/lib/search'
import { covers, parsePrefix, prefixSize, type Prefix } from '~/lib/ip'
import { specialUseOverlaps } from '~/lib/analysis/special-use'
import type { PrefixSummary } from '~/lib/analysis/types'
import type { PrefixReport } from '~/server/services/prefix'

export const Route = createFileRoute('/prefix/$')({
  validateSearch: reportSearchSchema,
  beforeLoad: ({ params, search }) => {
    // The router has already decoded the splat; decoding again breaks on '%'.
    const raw = params._splat ?? ''
    const q = classifyQuery(raw)
    if (q.kind === 'invalid') return { query: null, error: q.reason, raw }
    const loc = locationFor(q)
    // Canonicalise the URL (host bits zeroed, lower-case IPv6) or move to the right view.
    if (q.kind !== 'prefix' || loc.to !== '/prefix/$' || loc.params._splat !== raw) {
      throw redirect({ ...loc, search, replace: true })
    }
    return { query: q.cidr, error: null, raw }
  },
  loader: async ({ context }) => {
    if (context.query)
      await context.queryClient.query({ ...prefixQuery(context.query), staleTime: 'static' })
    return { query: context.query, error: context.error, raw: context.raw }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `IRR Explorer NG: ${loaderData.raw}` : 'IRR Explorer NG' }],
  }),
  pendingComponent: () => <Pending label="Collecting BGP, IRR and RPKI data" />,
  component: PrefixPage,
})

function PrefixPage() {
  const { query, error, raw } = Route.useLoaderData()
  if (!query) return <InvalidQuery what="prefix" raw={raw} error={error} />
  return <PrefixReportView query={query} />
}

function sizeText(p: Prefix): string {
  if (p.version === 4) return `${prefixSize(p).toLocaleString('en-US')} addresses`
  const bits = 128 - p.length
  return bits >= 64 ? `2^${bits - 64} /64s` : `2^${bits} addresses`
}

/** The row for the query itself, or else the most specific row covering it. */
function closestRow(rows: PrefixSummary[], q: Prefix): PrefixSummary | null {
  let best: { row: PrefixSummary; len: number } | null = null
  for (const row of rows) {
    const p = parsePrefix(row.prefix)
    if (p && covers(p, q) && (!best || p.length > best.len)) best = { row, len: p.length }
  }
  return best?.row ?? null
}

function PrefixReportView({ query }: { query: string }) {
  const search = Route.useSearch()
  const update = useReportUpdate()
  const { data } = useSuspenseQuery(prefixQuery(query))
  const prefix = parsePrefix(data.query)!
  useRecordRecent({
    path: `/prefix/${data.query}`,
    label: data.query,
    kind: 'prefix',
  })

  const tables: TableSpec[] = [
    {
      id: 'overlaps',
      sortKey: 'sort',
      defaultSort: 'prefix',
      title: (
        <>
          Directly overlapping prefixes of <span className="font-mono">{data.query}</span>
        </>
      ),
      rows: data.overlaps,
      jsonHref: `/api/prefixes/prefix/${data.query}`,
      emptyText: 'No prefixes were found.',
    },
  ]
  if (data.leastSpecific && !data.leastSpecific.tooLarge) {
    tables.push({
      id: 'least-specific',
      sortKey: 'sort2',
      defaultSort: 'specific',
      title: (
        <>
          All overlaps of least specific match{' '}
          <span className="font-mono">{data.leastSpecific.prefix}</span>
        </>
      ),
      rows: data.leastSpecific.rows,
      jsonHref: `/api/prefixes/prefix/${data.leastSpecific.prefix}`,
    })
  }
  const neighbourhood = data.leastSpecific?.rows.length ? data.leastSpecific.rows : data.overlaps

  return (
    <div>
      <PageTitle kind="prefix">{data.query}</PageTitle>
      <div className="mb-6">
        <FactStrip label="Prefix facts" facts={facts(data, prefix)} />
      </div>
      <SourceNotices notices={data.notices} />
      {data.tooLarge ? (
        <p
          role="alert"
          className="border border-dashed border-[var(--rule-strong)] px-4 py-6 font-mono text-[0.85rem]"
        >
          Query too large: the minimum prefix length is {data.minLength}.
        </p>
      ) : (
        <>
          <Findings
            rows={data.overlaps}
            reduced={!!search.reduced}
            scope="overlapping the query"
            onFilter={(v) => update({ filter: v })}
          />
          <AddressMap rows={neighbourhood} query={prefix} reduced={!!search.reduced} />
          <ReportTables search={search} tables={tables} asNames={data.asNames} />
          {data.leastSpecific?.tooLarge ? (
            <p className="mb-8 font-mono text-[0.8rem] text-[var(--muted)]">
              The least specific match {data.leastSpecific.prefix} is shorter than the minimum
              prefix length, so its overlaps are not listed.
            </p>
          ) : null}
          <Explanation />
        </>
      )}
    </div>
  )
}

function facts(data: PrefixReport, prefix: Prefix): Fact[] {
  const out: Fact[] = [
    { label: 'Family', value: `IPv${prefix.version} /${prefix.length}` },
    { label: 'Size', value: sizeText(prefix) },
  ]
  const own = closestRow(data.overlaps, prefix)
  out.push({
    label: 'RIR',
    value: own?.rir ?? <span className="text-[var(--faint)]">unknown</span>,
  })
  if (data.isHost) {
    out.push({
      label: 'Covering route',
      value: data.coveringAnnounced ? (
        <Link to="/prefix/$" params={{ _splat: data.coveringAnnounced }}>
          {data.coveringAnnounced}
        </Link>
      ) : (
        'No announced prefix covers this address.'
      ),
      wide: !data.coveringAnnounced,
    })
  }
  const exact = data.overlaps.find((r) => r.prefix === prefix.cidr)
  if (exact && exact.bgpOrigins.length > 0) {
    out.push({
      label: 'Origin',
      value: (
        <span className="flex flex-wrap gap-x-3">
          {exact.bgpOrigins.map((o) => (
            <span key={o.asn} className="inline-flex items-center gap-2">
              <Link to="/asn/$asn" params={{ asn: `AS${o.asn}` }}>
                AS{o.asn}
              </Link>
              <RpkiWord validity={o.rpki} />
            </span>
          ))}
        </span>
      ),
    })
  }
  if (!data.tooLarge) out.push(locationFact(data))
  const v = data.visibility
  if (v && v.total > 0) {
    out.push({
      label: 'RIS visibility',
      value: (
        <span className="inline-flex items-center gap-2">
          <Meter value={v.seeing} max={v.total} label="RIS peers seeing this prefix" />
          <span>
            Seen by {v.seeing} of {v.total} RIPE RIS full-feed peers
          </span>
        </span>
      ),
      wide: true,
    })
    if (v.firstSeen) out.push({ label: 'First seen', value: v.firstSeen.slice(0, 10) })
    if (v.asOf)
      out.push({ label: 'RIS as of', value: `${v.asOf.slice(0, 16).replace('T', ' ')} UTC` })
  }
  for (const s of specialUseOverlaps(prefix)) {
    out.push({
      label: 'Special use',
      value: (
        <span className="text-[var(--danger-fg)]">
          Overlaps with {s.name} special use prefix {s.prefix.cidr}
        </span>
      ),
      wide: true,
    })
  }
  return out
}

function locationFact(data: PrefixReport): Fact {
  const geo = data.geo
  if (!geo)
    return {
      label: 'Location',
      value: <span className="text-[var(--faint)]">{geoMissingText(data.geoip)}</span>,
    }
  if (geo.place) return { label: 'Location', value: <GeoPlaceView place={geo.place} />, wide: true }
  if (geo.countries.length === 0)
    return {
      label: 'Location',
      value: <span className="text-[var(--faint)]">No GeoLite2 data</span>,
    }
  return { label: 'Location', value: <GeoShares geo={geo} />, wide: geo.countries.length > 1 }
}
