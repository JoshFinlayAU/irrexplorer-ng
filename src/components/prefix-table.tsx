import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  globalFilteringFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
} from '@tanstack/react-table'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { Link } from '@tanstack/react-router'
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useHydrated } from '~/lib/use-client'
import { compareCidr, parsePrefix } from '~/lib/ip'
import { lookingGlassUrl } from '~/lib/links'
import { describeValidity } from '~/lib/analysis/rpki'
import type { IrrRoute, PrefixSummary } from '~/lib/analysis/types'
import { CaretRightIcon, SortIcon } from './icons'
import { CategoryIcon, MessageList, RpkiMark, rowClass } from './status'
import { WhoisDialog, type WhoisTarget } from './whois-dialog'

const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  columnVisibilityFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
})

const helper = createColumnHelper<typeof features, PrefixSummary>()

/** "prefix" ascending or "-prefix" descending, as stored in the URL. */
export function parseSort(value: string | undefined, fallback: string): SortingState {
  const v = value ?? fallback
  return [{ id: v.replace(/^-/, ''), desc: v.startsWith('-') }]
}
export function formatSort(state: SortingState): string | undefined {
  const s = state[0]
  return s ? `${s.desc ? '-' : ''}${s.id}` : undefined
}

const firstOr = (list: number[], fallback = Number.POSITIVE_INFINITY) =>
  list.length > 0 ? list[0]! : fallback
const lengthOf = (cidr: string) => parsePrefix(cidr)?.length ?? 0

function AsnText({ asn, names }: { asn: number; names: Record<string, string> }) {
  const name = names[asn]
  return (
    <abbr title={name ? `AS${asn} ${name}` : `AS${asn}`} className="no-underline">
      {asn}
    </abbr>
  )
}

export interface PrefixTableProps {
  id: string
  title: ReactNode
  rows: PrefixSummary[]
  asNames: Record<string, string>
  sort: SortingState
  onSortChange: (s: SortingState) => void
  hidden: string[]
  onHiddenChange: (h: string[]) => void
  reduced: boolean
  issuesOnly: boolean
  filter: string
  jsonHref: string
  emptyText?: string
}

export function PrefixTable(props: PrefixTableProps) {
  const { rows, asNames, reduced, issuesOnly, filter } = props
  const [whois, setWhois] = useState<WhoisTarget | null>(null)

  const sources = useMemo(
    () => [...new Set(rows.flatMap((r) => Object.keys(r.irrRoutes)))].sort(),
    [rows],
  )

  const columns = useMemo(() => {
    const irrCell = (prefix: string, source: string, list: IrrRoute[] | undefined) =>
      list && list.length > 0 ? (
        <ul className="flex flex-wrap gap-x-2 font-mono">
          {list.map((r) => (
            <li key={r.asn}>
              <button
                type="button"
                onClick={() =>
                  setWhois({ prefix, asn: r.asn, source, rpslPk: r.rpslPk, rpki: r.rpki })
                }
                className={`inline-flex items-center gap-0.5 text-[var(--accent)] hover:underline ${
                  r.rpki.state === 'invalid' ? 'line-through' : ''
                }`}
                aria-label={`AS${r.asn} route object in ${source}, ${describeValidity(r.rpki)}. Show object`}
              >
                <AsnText asn={r.asn} names={asNames} />
                <RpkiMark validity={r.rpki} />
              </button>
            </li>
          ))}
        </ul>
      ) : null

    return helper.columns([
      helper.accessor('prefix', {
        id: 'prefix',
        header: 'Prefix',
        sortFn: (a, b) => compareCidr(a.original.prefix, b.original.prefix),
        cell: (info) => (
          <Link
            to="/prefix/$"
            params={{ _splat: info.getValue() }}
            className="font-mono whitespace-nowrap"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      // Not shown; lets "most specific first" be an ordinary sort.
      helper.accessor((r) => r.prefix, {
        id: 'specific',
        header: 'Most specific first',
        enableHiding: false,
        sortFn: (a, b) =>
          lengthOf(b.original.prefix) - lengthOf(a.original.prefix) ||
          compareCidr(a.original.prefix, b.original.prefix),
      }),
      helper.accessor((r) => r.rir ?? '', {
        id: 'rir',
        header: 'RIR',
        sortFn: (a, b) => (a.original.rir ?? '~').localeCompare(b.original.rir ?? '~'),
        cell: (info) => <span className="whitespace-nowrap">{info.getValue()}</span>,
      }),
      helper.accessor((r) => r.bgpOrigins.map((o) => o.asn).join(' '), {
        id: 'bgp',
        header: 'BGP',
        sortFn: (a, b) =>
          firstOr(a.original.bgpOrigins.map((o) => o.asn)) -
          firstOr(b.original.bgpOrigins.map((o) => o.asn)),
        cell: (info) => {
          const r = info.row.original
          if (r.bgpOrigins.length === 0) return null
          return (
            <a
              href={lookingGlassUrl(r.prefix)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex flex-wrap gap-x-2 font-mono"
              aria-label={`BGP origins ${r.bgpOrigins.map((o) => `AS${o.asn} (${describeValidity(o.rpki)})`).join(', ')}. Open in the NLNOG RING looking glass`}
            >
              {r.bgpOrigins.map((o) => (
                <span key={o.asn} className="inline-flex items-center gap-0.5">
                  <AsnText asn={o.asn} names={asNames} />
                  <RpkiMark validity={o.rpki} />
                </span>
              ))}
            </a>
          )
        },
      }),
      helper.accessor((r) => r.rpkiRoutes.map((o) => o.asn).join(' '), {
        id: 'rpki',
        header: 'RPKI',
        sortFn: (a, b) =>
          firstOr(a.original.rpkiRoutes.map((o) => o.asn)) -
          firstOr(b.original.rpkiRoutes.map((o) => o.asn)),
        cell: (info) => (
          <ul className="flex flex-wrap gap-x-2 font-mono">
            {info.row.original.rpkiRoutes.map((roa) => (
              <li
                key={`${roa.asn}/${roa.maxLength}`}
                className="inline-flex items-center whitespace-nowrap"
              >
                <AsnText asn={roa.asn} names={asNames} />
                <CaretRightIcon className="text-[var(--muted)]" title="max length" />/
                {roa.maxLength}
              </li>
            ))}
          </ul>
        ),
      }),
      ...sources.map((source) =>
        helper.accessor((r) => (r.irrRoutes[source] ?? []).map((o) => o.asn).join(' '), {
          id: `irr:${source}`,
          header: source,
          sortFn: (a, b) =>
            firstOr((a.original.irrRoutes[source] ?? []).map((o) => o.asn)) -
            firstOr((b.original.irrRoutes[source] ?? []).map((o) => o.asn)),
          cell: (info) =>
            irrCell(info.row.original.prefix, source, info.row.original.irrRoutes[source]),
        }),
      ),
      helper.accessor('categoryOverall', {
        id: 'status',
        header: 'Status',
        enableSorting: false,
        filterFn: (row, _id, value: string[]) => value.includes(row.original.categoryOverall),
        cell: (info) => <CategoryIcon category={info.getValue()} />,
      }),
      helper.accessor((r) => r.messages.map((m) => m.text).join(' '), {
        id: 'advice',
        header: 'Advice',
        sortFn: (a, b) => a.original.goodnessOverall - b.original.goodnessOverall,
        cell: (info) => <MessageList messages={info.row.original.messages} reduced={reduced} />,
      }),
    ])
  }, [sources, asNames, reduced])

  const columnVisibility = useMemo(() => {
    const v: Record<string, boolean> = { specific: false, status: reduced }
    for (const id of props.hidden) v[id] = false
    return v
  }, [props.hidden, reduced])

  const columnFilters = useMemo(
    () => (issuesOnly ? [{ id: 'status', value: ['danger', 'warning'] }] : []),
    [issuesOnly],
  )

  const table = useTable({
    features,
    columns,
    data: rows,
    state: { sorting: props.sort, columnVisibility, columnFilters, globalFilter: filter },
    onSortingChange: (updater) => {
      props.onSortChange(typeof updater === 'function' ? updater(props.sort) : updater)
    },
    enableSortingRemoval: false,
    globalFilterFn: (row, _id, value: string) => {
      const needle = value
        .trim()
        .toLowerCase()
        .replace(/^as(?=\d)/, '')
      if (!needle) return true
      const r = row.original
      const hay = [
        r.prefix,
        r.rir ?? '',
        ...r.bgpOrigins.map((o) => String(o.asn)),
        ...r.rpkiRoutes.map((o) => String(o.asn)),
        ...Object.entries(r.irrRoutes).flatMap(([s, l]) => [s, ...l.map((o) => String(o.asn))]),
        ...r.messages.map((m) => m.text),
      ]
      return hay.some((h) => h.toLowerCase().includes(needle))
    },
  })

  const visibleRows = table.getRowModel().rows
  const headerGroups = table.getHeaderGroups()
  const hideable = table.getAllLeafColumns().filter((c) => c.id !== 'specific' && c.id !== 'status')
  const specificFirst = props.sort[0]?.id === 'specific'

  return (
    <section aria-labelledby={`${props.id}-title`} className="mb-8">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <h2 id={`${props.id}-title`} className="text-lg font-semibold">
          {props.title}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            aria-pressed={specificFirst}
            onClick={() =>
              props.onSortChange(
                specificFirst ? [{ id: 'prefix', desc: false }] : [{ id: 'specific', desc: false }],
              )
            }
            className="rounded-md border border-[var(--border)] px-2 py-1 hover:bg-[var(--surface-2)]"
          >
            Most specific first
          </button>
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md border border-[var(--border)] px-2 py-1 hover:bg-[var(--surface-2)]">
              Columns
            </summary>
            <fieldset className="surface absolute right-0 z-20 mt-1 flex min-w-44 flex-col gap-1 rounded-md p-2 shadow-lg">
              <legend className="sr-only">Visible columns</legend>
              {hideable.map((c) => (
                <label key={c.id} className="flex items-center gap-2 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={c.getIsVisible()}
                    onChange={(e) => {
                      const next = new Set(props.hidden)
                      if (e.target.checked) next.delete(c.id)
                      else next.add(c.id)
                      props.onHiddenChange([...next])
                    }}
                  />
                  {typeof c.columnDef.header === 'string' ? c.columnDef.header : c.id}
                </label>
              ))}
            </fieldset>
          </details>
        </div>
      </div>

      <div className="surface overflow-x-auto rounded-md">
        <table className="w-full border-collapse text-sm" aria-describedby={`${props.id}-count`}>
          <thead className="sticky top-0 z-10 bg-[var(--surface-2)]">
            {headerGroups.map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  const canSort = header.column.getCanSort()
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
                      {header.column.id === 'status' ? (
                        <span className="sr-only">Status</span>
                      ) : canSort ? (
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
          <Body table={table} rows={visibleRows} reduced={reduced} />
        </table>
        {visibleRows.length === 0 ? (
          <p className="px-3 py-6 text-center text-[var(--muted)]">
            {rows.length === 0
              ? (props.emptyText ?? 'No prefixes were found.')
              : issuesOnly && !filter
                ? 'No records with an error or warning status.'
                : 'No rows match the current filter.'}
          </p>
        ) : null}
      </div>
      <p
        id={`${props.id}-count`}
        className="mt-1.5 flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]"
      >
        <span>
          {visibleRows.length === rows.length
            ? `${rows.length} ${rows.length === 1 ? 'prefix' : 'prefixes'}`
            : `${visibleRows.length} of ${rows.length} prefixes shown`}
        </span>
        <a href={props.jsonHref}>Source data as JSON</a>
      </p>
      {whois ? <WhoisDialog target={whois} onClose={() => setWhois(null)} /> : null}
    </section>
  )
}

type AppTable = ReturnType<typeof useTable<typeof features, PrefixSummary>>
type AppRow = ReturnType<AppTable['getRowModel']>['rows'][number]

const VIRTUALIZE_FROM = 250

function Body({ table, rows, reduced }: { table: AppTable; rows: AppRow[]; reduced: boolean }) {
  const ref = useRef<HTMLTableSectionElement>(null)
  const [margin, setMargin] = useState(0)
  const mounted = useHydrated()
  const large = rows.length >= VIRTUALIZE_FROM
  // SSR and the first client render show a fixed slice so hydration matches;
  // the virtualizer takes over once mounted.
  const virtual = large && mounted
  useLayoutEffect(() => {
    if (ref.current) setMargin(ref.current.getBoundingClientRect().top + window.scrollY)
  }, [virtual])

  const virtualizer = useWindowVirtualizer({
    count: virtual ? rows.length : 0,
    estimateSize: () => 52,
    overscan: 12,
    scrollMargin: margin,
  })

  const renderRow = (row: AppRow, index?: number) => (
    <tr
      key={row.id}
      data-index={index}
      ref={virtual ? virtualizer.measureElement : undefined}
      className={`border-b border-[var(--border)] align-top last:border-b-0 ${reduced ? '' : rowClass[row.original.categoryOverall]}`}
    >
      {row.getVisibleCells().map((cell) => (
        <td key={cell.id} className="px-3 py-2">
          <table.FlexRender cell={cell} />
        </td>
      ))}
    </tr>
  )

  if (!virtual) {
    return <tbody ref={ref}>{(large ? rows.slice(0, 60) : rows).map((r) => renderRow(r))}</tbody>
  }

  const items = virtualizer.getVirtualItems()
  const colSpan = rows[0]?.getVisibleCells().length ?? 1
  const top = items[0] ? items[0].start - virtualizer.options.scrollMargin : 0
  const bottom = items.length > 0 ? virtualizer.getTotalSize() - items[items.length - 1]!.end : 0
  return (
    <tbody ref={ref}>
      {top > 0 ? (
        <tr aria-hidden="true">
          <td colSpan={colSpan} style={{ height: top, padding: 0 }} />
        </tr>
      ) : null}
      {items.map((item) => renderRow(rows[item.index]!, item.index))}
      {bottom > 0 ? (
        <tr aria-hidden="true">
          <td colSpan={colSpan} style={{ height: bottom, padding: 0 }} />
        </tr>
      ) : null}
    </tbody>
  )
}
