import { createFileRoute, redirect } from '@tanstack/react-router'
import { classifyQuery } from '~/lib/parse'
import { locationFor } from '~/lib/links'

// /query/<anything>: classify and send to the right view. Used for set
// member links, and works on a full page load (the original only handled
// this through client-side navigation).
export const Route = createFileRoute('/query/$')({
  beforeLoad: ({ params }) => {
    const raw = decodeURIComponent(params._splat ?? '')
    const q = classifyQuery(raw)
    if (q.kind === 'invalid') return { error: q.reason, raw }
    throw redirect({ ...locationFor(q), replace: true })
  },
  loader: ({ context }) => ({ error: context.error, raw: context.raw }),
  component: InvalidQuery,
})

function InvalidQuery() {
  const { error, raw } = Route.useLoaderData()
  return (
    <div className="py-8">
      <h1 className="mb-2 text-2xl font-semibold">Query not recognised</h1>
      <p role="alert" className="text-[var(--danger-fg)]">
        <span className="font-mono">{raw}</span>: {error}
      </p>
    </div>
  )
}
