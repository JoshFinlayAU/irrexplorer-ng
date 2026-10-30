import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Explanation } from '~/components/explanation'
import { SourceNotices } from '~/components/notices'
import { ReportTables } from '~/components/report-tables'
import { Pending } from '~/components/route-states'
import { MemberOfTable } from '~/components/set-tables'
import { badgeClass } from '~/components/status'
import { classifyQuery, formatAsn } from '~/lib/parse'
import { locationFor } from '~/lib/links'
import { asnQuery, memberOfQuery } from '~/lib/queries'
import { reportSearchSchema } from '~/lib/search'

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
      // Member-of tables load alongside but never hold up the prefix tables.
      void context.queryClient.query(memberOfQuery(target, 'as-set')).catch(() => undefined)
      void context.queryClient.query(memberOfQuery(target, 'route-set')).catch(() => undefined)
      await context.queryClient.query({ ...asnQuery(context.asn), staleTime: 'static' })
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
  if (asn === null) {
    return (
      <div className="py-8">
        <h1 className="mb-2 text-2xl font-semibold">Not a valid AS number</h1>
        <p role="alert" className="text-[var(--danger-fg)]">
          <span className="font-mono">{raw}</span>: {error}
        </p>
      </div>
    )
  }
  return <AsnReportView asn={asn} />
}

function AsnReportView({ asn }: { asn: number }) {
  const search = Route.useSearch()
  const { data } = useSuspenseQuery(asnQuery(asn))
  const label = formatAsn(asn)
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">
        Report for ASN <span className="font-mono">{label}</span>
      </h1>
      <p className="mb-4 text-sm text-[var(--muted)]">{data.name ?? 'AS name unknown'}</p>
      <SourceNotices notices={data.notices} />
      <Explanation />
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
  )
}

export function MemberOfSection({
  target,
  objectClass,
  title,
}: {
  target: string
  objectClass: 'as-set' | 'route-set'
  title: string
}) {
  const query = useQuery(memberOfQuery(target, objectClass))
  const jsonHref = `/api/sets/member-of/${objectClass}/${target}`
  if (query.isPending) {
    return (
      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">{title}</h2>
        <Pending label="Looking up sets" />
      </section>
    )
  }
  if (query.isError || !query.data.ok) {
    const msg = query.isError ? query.error.message : query.data.ok ? '' : query.data.error
    return (
      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">{title}</h2>
        <p role="alert" className={`rounded-md px-3 py-2 text-sm ${badgeClass.danger}`}>
          IRRd unavailable: {msg}. Set membership could not be checked.
        </p>
      </section>
    )
  }
  return (
    <MemberOfTable
      memberOf={query.data.memberOf}
      objectClass={objectClass}
      title={title}
      jsonHref={jsonHref}
    />
  )
}
