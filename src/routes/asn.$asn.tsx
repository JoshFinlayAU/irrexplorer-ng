import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Explanation } from '~/components/explanation'
import { Findings } from '~/components/findings'
import { SourceNotices } from '~/components/notices'
import { ReportTables, useReportUpdate } from '~/components/report-tables'
import { InvalidQuery, Pending } from '~/components/route-states'
import { MemberOfSection } from '~/components/member-of-section'
import { FactStrip, PageTitle, type Fact } from '~/components/ui'
import { classifyQuery, formatAsn } from '~/lib/parse'
import { locationFor } from '~/lib/links'
import { asnQuery, memberOfQuery } from '~/lib/queries'
import { useRecordRecent } from '~/lib/recent'
import { reportSearchSchema } from '~/lib/search'
import { parsePrefix } from '~/lib/ip'
import type { PrefixSummary } from '~/lib/analysis/types'

export const Route = createFileRoute('/asn/$asn')({
  validateSearch: reportSearchSchema,
  beforeLoad: ({ params, search }) => {
    const q = classifyQuery(params.asn)
    if (q.kind === 'invalid') return { asn: null, error: q.reason }
    const loc = locationFor(q)
    if (loc.to !== '/asn/$asn' || loc.params.asn !== params.asn)
      throw redirect({ ...loc, search, replace: true })
    return { asn: q.kind === 'asn' ? q.asn : null, error: null }
  },
  loader: async ({ context, params }) => {
    if (context.asn !== null) {
      const target = formatAsn(context.asn)
      // Awaited together so SSR and hydration render from the same data.
      await Promise.all([
        context.queryClient.query({ ...asnQuery(context.asn), staleTime: 'static' }),
        context.queryClient.query({ ...memberOfQuery(target, 'as-set'), staleTime: 'static' }),
        context.queryClient.query({ ...memberOfQuery(target, 'route-set'), staleTime: 'static' }),
      ])
    }
    return { asn: context.asn, error: context.error, raw: params.asn }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `IRR Explorer NG: ${loaderData.raw}` : 'IRR Explorer NG' }],
  }),
  pendingComponent: () => <Pending label="Collecting prefixes originated by this ASN" />,
  component: AsnPage,
})

function AsnPage() {
  const { asn, error, raw } = Route.useLoaderData()
  if (asn === null) return <InvalidQuery what="AS number" raw={raw} error={error} />
  return <AsnReportView asn={asn} />
}

function asnFacts(asn: number, rows: PrefixSummary[]): Fact[] {
  const bgp = rows.filter((r) => r.bgpOrigins.some((o) => o.asn === asn))
  const v4 = bgp.filter((r) => parsePrefix(r.prefix)?.version === 4).length
  const roas = rows.reduce((n, r) => n + r.rpkiRoutes.filter((o) => o.asn === asn).length, 0)
  const irr = new Map<string, number>()
  for (const r of rows) {
    for (const [source, list] of Object.entries(r.irrRoutes)) {
      if (list.some((o) => o.asn === asn)) irr.set(source, (irr.get(source) ?? 0) + 1)
    }
  }
  const invalid = bgp.filter((r) =>
    r.bgpOrigins.some((o) => o.asn === asn && o.rpki.state === 'invalid'),
  ).length
  return [
    { label: 'Announced', value: `${bgp.length} (${v4} v4, ${bgp.length - v4} v6)` },
    {
      label: 'RPKI invalid in BGP',
      value: <span className={invalid ? 'text-[var(--danger-fg)]' : ''}>{invalid}</span>,
    },
    { label: 'ROAs', value: roas },
    {
      label: 'Route objects',
      value:
        irr.size === 0
          ? '0'
          : [...irr.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([s, n]) => `${s} ${n}`)
              .join('  '),
      wide: irr.size > 2,
    },
  ]
}

function AsnReportView({ asn }: { asn: number }) {
  const search = Route.useSearch()
  const update = useReportUpdate()
  const { data } = useSuspenseQuery(asnQuery(asn))
  const label = formatAsn(asn)
  useRecordRecent({ path: `/asn/${label}`, label, kind: 'asn' })
  return (
    <div>
      <PageTitle kind="ASN" sub={data.name ?? 'AS name unknown'}>
        {label}
      </PageTitle>
      <div className="mb-6">
        <FactStrip label="ASN facts" facts={asnFacts(asn, data.directOrigin)} />
      </div>
      <SourceNotices notices={data.notices} />
      <Findings
        rows={data.directOrigin}
        reduced={!!search.reduced}
        scope={`originated by ${label}`}
        onFilter={(v) => update({ filter: v })}
      />
      <ReportTables
        search={search}
        asNames={data.asNames}
        tables={[
          {
            id: 'direct',
            sortKey: 'sort',
            defaultSort: 'prefix',
            title: (
              <>
                Prefixes originated by <span className="font-mono">{label}</span>
              </>
            ),
            rows: data.directOrigin,
            jsonHref: `/api/prefixes/asn/${label}`,
            emptyText: 'No prefixes were found or query was too large to execute.',
          },
          {
            id: 'overlaps',
            sortKey: 'sort2',
            defaultSort: 'specific',
            title: (
              <>
                Other prefixes overlapping with prefixes originated by{' '}
                <span className="font-mono">{label}</span>
              </>
            ),
            rows: data.overlaps,
            jsonHref: `/api/prefixes/asn/${label}`,
          },
        ]}
      />
      <div className="grid gap-x-8 lg:grid-cols-2">
        <MemberOfSection
          target={label}
          objectClass="as-set"
          title="Included in the following AS sets:"
        />
        <MemberOfSection
          target={label}
          objectClass="route-set"
          title="Included in the following route sets:"
        />
      </div>
      <Explanation />
    </div>
  )
}
