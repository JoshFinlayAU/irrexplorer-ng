import { Link } from '@tanstack/react-router'
import type { MemberOf, SetExpansion, SetRow } from '~/lib/analysis/types'
import { classifyQuery } from '~/lib/parse'
import { locationFor } from '~/lib/links'
import { stripRangeOperator } from '~/lib/analysis/sets'
import { LoopIcon, SuccessIcon, WarningIcon } from './icons'
import { badgeClass } from './status'

export function MemberLink({ member }: { member: string }) {
  const q = classifyQuery(stripRangeOperator(member))
  if (q.kind === 'invalid') return <span className="font-mono">{member}</span>
  return (
    <Link {...locationFor(q)} className="font-mono">
      {member}
    </Link>
  )
}

function SetNameLink({ name, category }: { name: string; category: 'as-set' | 'route-set' }) {
  return category === 'route-set' ? (
    <Link to="/route-set/$name" params={{ name }} className="font-mono">
      {name}
    </Link>
  ) : (
    <Link to="/as-set/$name" params={{ name }} className="font-mono">
      {name}
    </Link>
  )
}

function MemberCell({ row }: { row: SetRow }) {
  const missing = new Set(row.missing)
  const loops = new Set(row.loops)
  return (
    <ul className="flex flex-wrap gap-x-2.5 gap-y-1">
      {row.members.map((m) => (
        <li key={m} className="inline-flex items-center gap-0.5">
          <MemberLink member={m} />
          {missing.has(m) ? (
            <span
              className={`ml-0.5 inline-flex items-center gap-0.5 rounded px-1 text-xs ${badgeClass.warning}`}
            >
              <WarningIcon /> not found
            </span>
          ) : null}
          {loops.has(m) ? (
            <span
              className={`ml-0.5 inline-flex items-center gap-0.5 rounded px-1 text-xs ${badgeClass.danger}`}
            >
              <LoopIcon /> loop
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

export function SetExpansionTable({ expansion }: { expansion: SetExpansion }) {
  const { rows, category } = expansion
  const loops = rows.reduce((n, r) => n + r.loops.length, 0)
  const missing = new Set(rows.flatMap((r) => r.missing)).size
  return (
    <section aria-labelledby="expansion-title" className="mb-8">
      <h2 id="expansion-title" className="mb-2 text-lg font-semibold">
        Expands to:
      </h2>
      {!expansion.found ? (
        <p className="surface rounded-md px-3 py-6 text-center text-[var(--muted)]">
          {category} was not found.
        </p>
      ) : (
        <>
          <ul className="mb-3 flex flex-wrap gap-2 text-sm" aria-label="Expansion summary">
            <li className="rounded-md border border-[var(--border)] px-2 py-1">
              {expansion.totalSets} {expansion.totalSets === 1 ? 'set' : 'sets'} resolved, depth{' '}
              {expansion.depthReached}
            </li>
            {expansion.truncated ? (
              <li
                role="status"
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${badgeClass.warning}`}
              >
                <WarningIcon /> Truncated: expansion stops beyond {expansion.limit} total {category}
                s
              </li>
            ) : null}
            {loops > 0 ? (
              <li
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${badgeClass.danger}`}
              >
                <LoopIcon /> {loops} {loops === 1 ? 'loop' : 'loops'} detected
              </li>
            ) : null}
            {missing > 0 ? (
              <li
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${badgeClass.warning}`}
              >
                <WarningIcon /> {missing} missing {missing === 1 ? 'member set' : 'member sets'}
              </li>
            ) : null}
          </ul>
          <div className="surface overflow-x-auto rounded-md">
            <table className="w-full border-collapse text-sm">
              <caption className="caption-bottom px-3 py-2 text-left text-xs text-[var(--muted)]">
                Expansion depth is limited beyond {expansion.limit} total {category}s.
              </caption>
              <thead className="sticky top-0 bg-[var(--surface-2)]">
                <tr>
                  {['Name', 'Source', 'Depth', 'Path', 'Members'].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="border-b border-[var(--border)] px-3 py-2 text-left font-semibold"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={`${r.path.join('>')}|${r.source}`}
                    className="border-b border-[var(--border)] align-top last:border-b-0"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      <SetNameLink name={r.name} category={category} />
                    </td>
                    <td className="px-3 py-2">{r.source}</td>
                    <td className="px-3 py-2">{r.depth}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.path.join(' > ')}</td>
                    <td className="px-3 py-2">
                      {r.members.length > 0 ? (
                        <MemberCell row={r} />
                      ) : (
                        <span className="text-[var(--muted)]">No members</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

export function MemberOfTable({
  memberOf,
  objectClass,
  title,
  jsonHref,
}: {
  memberOf: MemberOf
  objectClass: 'as-set' | 'route-set'
  title: string
  jsonHref: string
}) {
  const names = [...new Set(Object.values(memberOf.setsPerIrr).flat())].sort()
  const id = `memberof-${objectClass}`
  return (
    <section aria-labelledby={id} className="mb-8">
      <h2 id={id} className="mb-2 text-lg font-semibold">
        {title}
      </h2>
      {names.length === 0 ? (
        <p className="surface rounded-md px-3 py-6 text-center text-[var(--muted)]">
          No {objectClass}s were found.
        </p>
      ) : (
        <div className="surface overflow-x-auto rounded-md">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-[var(--surface-2)]">
              <tr>
                <th
                  scope="col"
                  className="border-b border-[var(--border)] px-3 py-2 text-left font-semibold"
                >
                  Name
                </th>
                {memberOf.irrsSeen.map((irr) => (
                  <th
                    key={irr}
                    scope="col"
                    className="border-b border-[var(--border)] px-3 py-2 text-left font-semibold"
                  >
                    {irr}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {names.map((name) => (
                <tr key={name} className="border-b border-[var(--border)] last:border-b-0">
                  <td className="px-3 py-2">
                    <SetNameLink name={name} category={objectClass} />
                  </td>
                  {memberOf.irrsSeen.map((irr) => (
                    <td key={irr} className="px-3 py-2">
                      {memberOf.setsPerIrr[irr]?.includes(name) ? (
                        <SuccessIcon
                          className="text-[var(--success-fg)]"
                          title={`Present in ${irr}`}
                        />
                      ) : (
                        <span className="sr-only">Not in {irr}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-1.5 text-right text-xs">
        <a href={jsonHref}>Source data as JSON</a>
      </p>
    </section>
  )
}
