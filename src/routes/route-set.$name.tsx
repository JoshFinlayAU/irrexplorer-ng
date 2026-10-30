import { createFileRoute, redirect } from '@tanstack/react-router'
import { InvalidQuery, Pending } from '~/components/route-states'
import { SetPage } from '~/components/set-page'
import { classifyQuery, setType } from '~/lib/parse'
import { locationFor } from '~/lib/links'
import { memberOfQuery, setQuery } from '~/lib/queries'
import { setSearchSchema } from '~/lib/search'
import { formatSort, parseSort } from '~/components/prefix-table'

export const Route = createFileRoute('/route-set/$name')({
  validateSearch: setSearchSchema,
  beforeLoad: ({ params }) => {
    const q = classifyQuery(params.name)
    if (q.kind === 'invalid') return { name: null, error: q.reason }
    // Wrong view (an ASN, a prefix, or the other set type) or non-canonical case: redirect.
    if (q.kind !== 'set' || setType(q.name) !== 'route-set' || q.name !== params.name) {
      throw redirect({ ...locationFor(q), replace: true })
    }
    return { name: q.name, error: null }
  },
  loader: async ({ context, params }) => {
    if (context.name) {
      await Promise.all([
        context.queryClient.query({ ...setQuery(context.name, 'route-set'), staleTime: 'static' }),
        context.queryClient.query({
          ...memberOfQuery(context.name, 'route-set'),
          staleTime: 'static',
        }),
      ])
    }
    return { name: context.name, error: context.error, raw: params.name }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `IRR Explorer NG: ${loaderData.raw}` : 'IRR Explorer NG' }],
  }),
  pendingComponent: () => <Pending label="Expanding set" />,
  component: Page,
})

function Page() {
  const { name, error, raw } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const state = {
    layout: search.layout ?? ('tree' as const),
    sort: parseSort(search.sort, 'depth'),
    filter: search.filter ?? '',
    problems: !!search.problems,
  }
  const update = (next: Partial<typeof state>) =>
    void navigate({
      search: (prev) => ({
        layout:
          next.layout !== undefined
            ? next.layout === 'tree'
              ? undefined
              : next.layout
            : prev.layout,
        sort: next.sort ? formatSort(next.sort) : prev.sort,
        filter: next.filter !== undefined ? next.filter || undefined : prev.filter,
        problems: next.problems !== undefined ? next.problems || undefined : prev.problems,
      }),
      replace: true,
      resetScroll: false,
    })
  if (!name) return <InvalidQuery what="set name" raw={raw} error={error} />
  return <SetPage name={name} category="route-set" state={state} onChange={update} />
}
