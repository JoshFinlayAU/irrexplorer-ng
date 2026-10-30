import { createFileRoute, Link } from '@tanstack/react-router'
import { SearchForm } from '~/components/search-form'

export const Route = createFileRoute('/')({
  component: Home,
})

const EXAMPLES: { label: string; to: string }[] = [
  { label: '193.0.0.0/21', to: '/prefix/193.0.0.0/21' },
  { label: '2001:67c:2e8::/48', to: '/prefix/2001:67c:2e8::/48' },
  { label: 'AS3333', to: '/asn/AS3333' },
  { label: 'AS-RIPENCC', to: '/as-set/AS-RIPENCC' },
]

function Home() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 py-12 sm:py-20">
      <div>
        <h1 className="mb-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          IRR Explorer <span className="text-[var(--accent)]">NG</span>
        </h1>
        <p className="text-lg text-[var(--muted)]">
          IRR Explorer shows the routing, IRR and RPKI status for resources, and highlights
          potential issues.
        </p>
      </div>
      <div>
        <p className="mb-2">Enter a prefix, IP address, AS number or AS/route set name.</p>
        <SearchForm large />
      </div>
      <div className="text-sm text-[var(--muted)]">
        <span>Examples: </span>
        <ul className="inline">
          {EXAMPLES.map((e, i) => (
            <li key={e.label} className="inline">
              {i > 0 ? ', ' : ''}
              <a href={e.to} className="font-mono">
                {e.label}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-2">
          <Link to="/status">Data source status</Link>
        </p>
      </div>
    </div>
  )
}
