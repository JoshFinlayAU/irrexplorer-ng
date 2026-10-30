import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { SearchForm } from '~/components/search-form'
import { SectionHead } from '~/components/ui'
import { statusQuery } from '~/lib/queries'
import { clearRecent, useRecent } from '~/lib/recent'
import { useNowMinute } from '~/lib/use-client'

export const Route = createFileRoute('/')({
  component: Home,
})

/** Accepted inputs, man-page style, each with live examples. */
const SYNOPSIS: { form: string; does: string; examples: { label: string; to: string }[] }[] = [
  {
    form: 'prefix',
    does: 'Every BGP, IRR and ROA entry overlapping it, plus the least specific match.',
    examples: [
      { label: '193.0.0.0/21', to: '/prefix/193.0.0.0/21' },
      { label: '2001:67c:2e8::/48', to: '/prefix/2001:67c:2e8::/48' },
    ],
  },
  {
    form: 'address',
    does: 'Resolves to the most specific announced prefix covering it.',
    examples: [{ label: '193.0.0.1', to: '/prefix/193.0.0.1' }],
  },
  {
    form: 'asn',
    does: 'What it originates in BGP and the IRR, what overlaps it, which sets include it.',
    examples: [
      { label: 'AS3333', to: '/asn/AS3333' },
      { label: '3333', to: '/asn/AS3333' },
    ],
  },
  {
    form: 'as-set',
    does: 'Recursive expansion with loops, missing members and depth.',
    examples: [{ label: 'AS-RIPENCC', to: '/as-set/AS-RIPENCC' }],
  },
  {
    form: 'route-set',
    does: 'Same, for route-sets. Hierarchical names like AS3333:RS-X work too.',
    examples: [{ label: 'RS-KROOT', to: '/route-set/RS-KROOT' }],
  },
]

function age(iso: string | null, now: number | null): string {
  if (!iso) return 'never'
  if (now === null) return iso.slice(0, 16).replace('T', ' ')
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
  if (m < 60) return `${m}m`
  if (m < 48 * 60) return `${Math.round(m / 60)}h`
  return `${Math.round(m / 1440)}d`
}

function Sources() {
  const { data, isPending, isError } = useQuery(statusQuery())
  const now = useNowMinute()
  if (isPending)
    return <p className="font-mono text-[0.78rem] text-[var(--faint)]">checking sources_</p>
  if (isError)
    return <p className="font-mono text-[0.78rem] text-[var(--danger-fg)]">status unavailable</p>
  const rows: { name: string; age: string; ok: boolean; detail?: string }[] = [
    ...data.datasets.map((d) => ({
      name: d.name,
      age: age(d.loadedAt, now),
      ok: !!d.loadedAt && !d.lastError,
      detail: d.size ? d.size.toLocaleString('en-US') : undefined,
    })),
    ...(data.irr ?? []).map((s) => ({
      name: `IRR ${s.source}`,
      age: age(s.lastUpdate, now),
      ok: true,
    })),
  ]
  return (
    <table className="w-full border-collapse font-mono text-[0.75rem]">
      <caption className="sr-only">Data source freshness</caption>
      <thead>
        <tr className="text-left">
          <th scope="col" className="label pb-1 font-medium">
            Source
          </th>
          <th scope="col" className="label pb-1 text-right font-medium">
            Rows
          </th>
          <th scope="col" className="label pb-1 text-right font-medium">
            Age
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} className="border-t border-[var(--rule)]">
            <td className="py-1">
              <span
                aria-hidden="true"
                className={`mr-2 inline-block h-1.5 w-1.5 align-middle ${r.ok ? 'bg-[var(--success-fg)]' : 'bg-[var(--danger-fg)]'}`}
              />
              {r.name}
              <span className="sr-only">{r.ok ? ' (ok)' : ' (not loaded)'}</span>
            </td>
            <td className="py-1 text-right text-[var(--muted)]">{r.detail ?? ''}</td>
            <td className="py-1 text-right">{r.age}</td>
          </tr>
        ))}
        {data.irr === null ? (
          <tr className="border-t border-[var(--rule)]">
            <td colSpan={3} className="py-1 text-[var(--danger-fg)]">
              IRRd unavailable
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  )
}

function Recent() {
  const recent = useRecent()
  if (recent.length === 0) {
    return (
      <p className="font-mono text-[0.78rem] text-[var(--faint)]">
        Nothing yet. Reports you open are listed here, in this browser only.
      </p>
    )
  }
  return (
    <>
      <ol className="font-mono text-[0.8rem]">
        {recent.map((r) => (
          <li
            key={r.path}
            className="flex items-baseline justify-between gap-3 border-t border-[var(--rule)] py-1"
          >
            <a href={r.path}>{r.label}</a>
            <span className="text-[0.68rem] text-[var(--faint)]">{r.kind}</span>
          </li>
        ))}
      </ol>
      <button type="button" onClick={clearRecent} className="label mt-2 hover:text-[var(--text)]">
        Clear history
      </button>
    </>
  )
}

function Home() {
  return (
    <div className="grid gap-x-12 gap-y-10 py-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:py-10">
      <div>
        <h1 className="mb-3">
          <span className="label mb-3 block">IRR Explorer NG: irr / bgp / rpki consistency</span>{' '}
          <span className="block max-w-[22ch] text-[2rem] leading-[1.1] font-semibold tracking-tight sm:text-[2.6rem]">
            Where the routing registry and the routing table disagree.
          </span>
        </h1>
        <p className="mb-8 max-w-[62ch] text-[var(--muted)]">
          IRR Explorer shows the routing, IRR and RPKI status for resources, and highlights
          potential issues. Enter a prefix, IP address, AS number or AS/route set name.
        </p>
        <SearchForm large />
        <p className="mt-2 font-mono text-[0.72rem] text-[var(--faint)]">
          Press / anywhere to jump here. Input is classified as you type.
        </p>

        <section aria-labelledby="synopsis-title" className="mt-12">
          <SectionHead id="synopsis-title" title="Synopsis" />
          <dl className="grid grid-cols-1 sm:grid-cols-[8rem_1fr]">
            {SYNOPSIS.map((s) => (
              <div key={s.form} className="contents">
                <dt className="border-t border-[var(--rule)] pt-2 font-mono text-[0.85rem] font-medium sm:py-2">
                  {s.form}
                </dt>
                <dd className="border-[var(--rule)] pb-2 sm:border-t sm:py-2">
                  <p className="text-[0.9rem]">{s.does}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-4 font-mono text-[0.8rem]">
                    {s.examples.map((e) => (
                      <a key={e.label} href={e.to}>
                        {e.label}
                      </a>
                    ))}
                  </p>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <aside className="flex flex-col gap-8 lg:border-l lg:border-[var(--rule)] lg:pl-8">
        <section aria-labelledby="recent-title">
          <SectionHead id="recent-title" title="Recent" level={2} />
          <Recent />
        </section>
        <section aria-labelledby="sources-title">
          <SectionHead
            id="sources-title"
            title="Sources"
            meta={
              <Link to="/status" className="label hover:text-[var(--text)]">
                Data source status
              </Link>
            }
          />
          <Sources />
        </section>
      </aside>
    </div>
  )
}
