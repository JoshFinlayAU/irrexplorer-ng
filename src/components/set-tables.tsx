import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
} from '@tanstack/react-table'
import { Link } from '@tanstack/react-router'
import { useId, useMemo } from 'react'
import {
  setKey,
  type MemberOf,
  type SetExpansion,
  type SetInfo,
  type SetRow,
} from '~/lib/analysis/types'
import { classifyQuery } from '~/lib/parse'
import { locationFor } from '~/lib/links'
import { ROW_LIMIT, stripRangeOperator } from '~/lib/analysis/sets'
import { LoopIcon, SortIcon, SuccessIcon, WarningIcon } from './icons'
import { VirtualRows } from './virtual-rows'
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

function MemberCell({ info, loops }: { info: SetInfo | undefined; loops: string[] }) {
  if (!info || info.members.length === 0)
    return <span className="text-[var(--muted)]">No members</span>
  const missing = new Set(info.missing)
  const loopSet = new Set(loops)
  return (
    <ul className="flex flex-wrap gap-x-2.5 gap-y-1">
      {info.members.map((m) => (
        <li key={m} className="inline-flex items-center gap-0.5">
          <MemberLink member={m} />
          {missing.has(m) ? (
            <span
              className={`ml-0.5 inline-flex items-center gap-0.5 rounded px-1 text-xs ${badgeClass.warning}`}
            >
              <WarningIcon /> not found
            </span>
          ) : null}
          {loopSet.has(m) ? (
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

const setFeatures = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
})
const setHelper = createColumnHelper<typeof setFeatures, SetRow>()

export interface SetTableState {
  sort: SortingState
  filter: string
  problems: boolean
}

export function SetExpansionTable({
  expansion,
  state,
  onChange,
}: {
  expansion: SetExpansion
  state: SetTableState
  onChange: (next: Partial<SetTableState>) => void
}) {
  const { rows, category, sets } = expansion
  const loops = rows.reduce((n, r) => n + r.loops.length, 0)
  const missing = new Set(Object.values(sets).flatMap((s) => s.missing)).size
  const filterId = useId()

  const columns = useMemo(
    () =>
      setHelper.columns([
        setHelper.accessor('name', {
          header: 'Name',
          cell: (info) => <SetNameLink name={info.getValue()} category={category} />,
        }),
        setHelper.accessor('source', { header: 'Source' }),
        setHelper.accessor('depth', { header: 'Depth' }),
        setHelper.accessor((r) => r.path.join(' > '), {
          id: 'path',
          header: 'Path',
          cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
        }),
        setHelper.accessor((r) => (sets[setKey(r.name, r.source)]?.members ?? []).join(' '), {
          id: 'members',
          header: 'Members',
          enableSorting: false,
          cell: (info) => (
            <MemberCell
              info={sets[setKey(info.row.original.name, info.row.original.source)]}
              loops={info.row.original.loops}
            />
          ),
        }),
      ]),
    [category, sets],
  )

  const data = useMemo(
    () =>
      state.problems
        ? rows.filter(
            (r) => r.loops.length > 0 || (sets[setKey(r.name, r.source)]?.missing.length ?? 0) > 0,
          )
        : rows,
    [rows, sets, state.problems],
  )

  const table = useTable({
    features: setFeatures,
    columns,
    data,
    state: { sorting: state.sort, globalFilter: state.filter },
    onSortingChange: (updater) =>
      onChange({ sort: typeof updater === 'function' ? updater(state.sort) : updater }),
    enableSortingRemoval: false,
    globalFilterFn: (row, _id, value: string) => {
      const needle = value.trim().toUpperCase()
      if (!needle) return true
      const r = row.original
      return (
        r.name.includes(needle) ||
        r.source.includes(needle) ||
        (sets[setKey(r.name, r.source)]?.members ?? []).some((m) =>
          m.toUpperCase().includes(needle),
        )
      )
    },
  })
  const visible = table.getRowModel().rows

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
              <li className={`rounded-md px-2 py-1 ${badgeClass.warning}`}>
                <span role="status" className="inline-flex items-center gap-1">
                  <WarningIcon /> Truncated: expansion stops beyond {expansion.limit} total{' '}
                  {category}s or {ROW_LIMIT.toLocaleString('en-US')} paths
                </span>
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
          <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={state.problems}
                onChange={(e) => onChange({ problems: e.target.checked })}
              />
              Show only rows with loops or missing sets
            </label>
            <div className="flex items-center gap-2">
              <label htmlFor={filterId}>Filter</label>
              <input
                id={filterId}
                type="search"
                value={state.filter}
                onChange={(e) => onChange({ filter: e.target.value })}
                placeholder="Set, source or member"
                className="surface w-56 rounded-md px-2 py-1"
              />
            </div>
          </div>
          <div className="surface overflow-x-auto rounded-md lg:overflow-visible">
            <table className="w-full border-collapse text-sm">
              <caption className="caption-bottom px-3 py-2 text-left text-xs text-[var(--muted)]">
                Expansion depth is limited beyond {expansion.limit} total {category}s.
              </caption>
              <thead className="sticky top-0 z-10 bg-[var(--surface-2)]">
                {table.getHeaderGroups().map((group) => (
                  <tr key={group.id}>
                    {group.headers.map((header) => {
                      const sorted = header.column.getIsSorted()
                      const label = <table.FlexRender header={header} />
                      return (
                        <th
                          key={header.id}
                          scope="col"
                          aria-sort={
                            sorted === 'asc'
                              ? 'ascending'
                              : sorted === 'desc'
                                ? 'descending'
                                : undefined
                          }
                          className="border-b border-[var(--border)] px-3 py-2 text-left font-semibold whitespace-nowrap"
                        >
                          {header.column.getCanSort() ? (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className="inline-flex items-center gap-1 hover:text-[var(--accent)]"
                            >
                              {label}
                              <SortIcon dir={sorted} />
                            </button>
                          ) : (
                            label
                          )}
                        </th>
                      )
                    })}
                  </tr>
                ))}
              </thead>
              <VirtualRows
                rows={visible}
                colSpan={5}
                renderRow={(row, index, measure) => (
                  <tr
                    key={row.id}
                    data-index={index}
                    ref={measure}
                    className="border-b border-[var(--border)] align-top last:border-b-0"
                  >
                    {row.getAllCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={`px-3 py-2 ${cell.column.id === 'name' ? 'whitespace-nowrap' : ''}`}
                      >
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                )}
              />
            </table>
            {visible.length === 0 ? (
              <p className="px-3 py-6 text-center text-[var(--muted)]">
                No rows match the current filter.
              </p>
            ) : null}
          </div>
          <p className="mt-1.5 text-xs text-[var(--muted)]">
            {visible.length === rows.length
              ? `${rows.length} rows`
              : `${visible.length} of ${rows.length} rows shown`}
          </p>
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
