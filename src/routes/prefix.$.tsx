import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { Explanation } from '~/components/explanation'
import { SourceNotices } from '~/components/notices'
import { ReportTables, type TableSpec } from '~/components/report-tables'
import { Pending } from '~/components/route-states'
import { classifyQuery } from '~/lib/parse'
import { locationFor } from '~/lib/links'
import { prefixQuery } from '~/lib/queries'
import { reportSearchSchema } from '~/lib/search'
import { parsePrefix } from '~/lib/ip'
import { specialUseOverlaps } from '~/lib/analysis/special-use'
import type { PrefixReport } from '~/server/services/prefix'
import type { ReactNode } from 'react'

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
  if (!query) {
    return (
      <div className="py-8">
        <h1 className="mb-2 text-2xl font-semibold">Not a valid prefix</h1>
        <p role="alert" className="text-[var(--danger-fg)]">
          <span className="font-mono">{raw}</span>: {error}
        </p>
      </div>
    )
  }
  return <PrefixReportView query={query} />
}

function PrefixReportView({ query }: { query: string }) {
  const search = Route.useSearch()
  const { data } = useSuspenseQuery(prefixQuery(query))

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

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">
        Report for prefix <span className="font-mono">{data.query}</span>
      </h1>
      <Summary data={data} />
      <SourceNotices notices={data.notices} />
      {data.tooLarge ? (
        <p role="alert" className="surface rounded-md px-4 py-6 text-center">
          Query too large: the minimum prefix length is {data.minLength}.
        </p>
      ) : (
        <>
          <Explanation />
          <ReportTables search={search} tables={tables} asNames={data.asNames} />
          {data.leastSpecific?.tooLarge ? (
            <p className="text-sm text-[var(--muted)]">
              The least specific match {data.leastSpecific.prefix} is shorter than the minimum
              prefix length, so its overlaps are not listed.
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}

function Summary({ data }: { data: PrefixReport }) {
  const v = data.visibility
  const facts: ReactNode[] = []
  if (data.isHost && data.coveringAnnounced) {
    facts.push(
      <>
        Most specific announced prefix covering this address:{' '}
        <Link to="/prefix/$" params={{ _splat: data.coveringAnnounced }} className="font-mono">
          {data.coveringAnnounced}
        </Link>
      </>,
    )
  } else if (data.isHost && !data.tooLarge) {
    facts.push(<>No announced prefix covers this address.</>)
  }
  const prefix = parsePrefix(data.query)
  for (const s of prefix ? specialUseOverlaps(prefix) : []) {
    facts.push(
      <span className="font-medium text-[var(--danger-fg)]">
        Overlaps with {s.name} special use prefix {s.prefix.cidr}
      </span>,
    )
  }
  if (v && v.total > 0) {
    facts.push(
      <>
        Seen by {v.seeing} of {v.total} RIPE RIS full-feed peers
        {v.firstSeen ? <>, first seen {v.firstSeen.slice(0, 10)}</> : null}
        {v.asOf ? <> (as of {v.asOf.slice(0, 16).replace('T', ' ')} UTC)</> : null}
      </>,
    )
  }
  if (facts.length === 0) return <div className="mb-4" />
  return (
    <ul className="mb-4 flex flex-col gap-0.5 text-sm text-[var(--muted)]">
      {facts.map((f, i) => (
        <li key={i}>{f}</li>
      ))}
    </ul>
  )
}
