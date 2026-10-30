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
import { useMemo } from 'react'
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
import { LoopIcon, SortIcon, WarningIcon } from './icons'
import { JsonLink, SectionHead } from './ui'
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
              className={`ml-0.5 inline-flex items-center gap-0.5 px-1 text-xs ${badgeClass.warning}`}
            >
              <WarningIcon /> not found
            </span>
          ) : null}
          {loopSet.has(m) ? (
            <span
              className={`ml-0.5 inline-flex items-center gap-0.5 px-1 text-xs ${badgeClass.danger}`}
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
  layout: 'tree' | 'table'
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
    <>
      {!expansion.found ? null : (
        <>
          <ul className="sr-only" aria-label="Expansion summary">
            <li className="border border-[var(--rule)] px-2 py-1">
              {expansion.totalSets} {expansion.totalSets === 1 ? 'set' : 'sets'} resolved, depth{' '}
              {expansion.depthReached}
            </li>
            {expansion.truncated ? (
              <li className={` px-2 py-1 ${badgeClass.warning}`}>
                <span role="status" className="inline-flex items-center gap-1">
                  <WarningIcon /> Truncated: expansion stops beyond {expansion.limit} total{' '}
                  {category}s or {ROW_LIMIT.toLocaleString('en-US')} paths
                </span>
              </li>
            ) : null}
            {loops > 0 ? (
              <li className={`inline-flex items-center gap-1 px-2 py-1 ${badgeClass.danger}`}>
                <LoopIcon /> {loops} {loops === 1 ? 'loop' : 'loops'} detected
              </li>
            ) : null}
            {missing > 0 ? (
              <li className={`inline-flex items-center gap-1 px-2 py-1 ${badgeClass.warning}`}>
                <WarningIcon /> {missing} missing {missing === 1 ? 'member set' : 'member sets'}
              </li>
            ) : null}
          </ul>
          <div className="panel overflow-x-auto lg:overflow-visible">
            <table className="w-full border-collapse text-sm">
              <caption className="caption-bottom px-3 py-2 text-left text-xs text-[var(--muted)]">
                Expansion depth is limited beyond {expansion.limit} total {category}s.
              </caption>
              <thead className="sticky top-0 z-10 bg-[var(--sunk)]">
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
                          className="border-b border-[var(--rule)] px-3 py-2 text-left font-semibold whitespace-nowrap"
                        >
                          {header.column.getCanSort() ? (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className="inline-flex items-center gap-1 hover:text-[var(--text)]"
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
                    className="border-b border-[var(--rule)] align-top last:border-b-0"
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
    </>
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
    <section aria-labelledby={id} className="mb-10">
      <SectionHead
        id={id}
        title={title}
        meta={
          <>
            <span className="font-mono text-[0.75rem] text-[var(--muted)]">
              {names.length} {names.length === 1 ? 'set' : 'sets'}
            </span>
            <JsonLink href={jsonHref} />
          </>
        }
      />
      {names.length === 0 ? (
        <p className="border border-dashed border-[var(--rule-strong)] px-3 py-4 text-center font-mono text-[0.8rem] text-[var(--muted)]">
          No {objectClass}s were found.
        </p>
      ) : (
        <ul className="columns-1 gap-x-6 border-t border-[var(--rule)] sm:columns-2">
          {names.map((name) => (
            <li
              key={name}
              className="flex break-inside-avoid items-baseline justify-between gap-3 border-b border-[var(--rule)] py-1 font-mono text-[0.8rem]"
            >
              <SetNameLink name={name} category={objectClass} />
              <span className="text-[0.68rem] text-[var(--muted)]">
                {memberOf.irrsSeen
                  .filter((irr) => memberOf.setsPerIrr[irr]?.includes(name))
                  .map((irr) => (
                    <span key={irr} className="ml-2" title={`Present in ${irr}`}>
                      {irr}
                    </span>
                  ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
