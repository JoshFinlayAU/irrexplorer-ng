// The table view: the original IRR Explorer grid (one column per IRR source),
// for engineers who want everything on one dense screen. Rows arrive already
// filtered; sorting is driven by the URL like the record view.
import {
  columnVisibilityFeature,
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
} from '@tanstack/react-table'
import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { VirtualRows } from './virtual-rows'
import { lookingGlassUrl } from '~/lib/links'
import { comparator, hasGeo, sourcesOf } from '~/lib/report-rows'
import type { IrrRoute, PrefixSummary } from '~/lib/analysis/types'
import { GeoCodes } from './geo'
import { SortIcon } from './icons'
import { CategoryIcon, MessageList, RpkiMark, edgeClass } from './status'
import type { WhoisTarget } from './whois-dialog'

const features = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
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

function AsnText({ asn, names }: { asn: number; names: Record<string, string> }) {
  const name = names[asn]
  return (
    <abbr title={name ? `AS${asn} ${name}` : `AS${asn}`} className="no-underline">
      {asn}
    </abbr>
  )
}

const sortWith = (id: string) => {
  const cmp = comparator(id)
  return (a: { original: PrefixSummary }, b: { original: PrefixSummary }) =>
    cmp(a.original, b.original)
}

export function PrefixGrid({
  id,
  rows,
  asNames,
  sort,
  onSortChange,
  hidden,
  reduced,
  onWhois,
}: {
  id: string
  rows: PrefixSummary[]
  asNames: Record<string, string>
  sort: SortingState
  onSortChange: (s: SortingState) => void
  hidden: string[]
  reduced: boolean
  onWhois: (t: WhoisTarget) => void
}) {
  const sources = useMemo(() => sourcesOf(rows), [rows])
  const withGeo = useMemo(() => hasGeo(rows), [rows])

  const columns = useMemo(() => {
    const irrCell = (prefix: string, source: string, list: IrrRoute[] | undefined) =>
      list && list.length > 0 ? (
        <ul className="flex flex-wrap gap-x-2 font-mono">
          {list.map((r) => (
            <li key={r.asn}>
              <button
                type="button"
                onClick={() =>
                  onWhois({ prefix, asn: r.asn, source, rpslPk: r.rpslPk, rpki: r.rpki })
                }
                className={`inline-flex items-center gap-0.5 underline decoration-[var(--rule-strong)] underline-offset-2 hover:decoration-current ${
                  r.rpki.state === 'invalid' ? 'line-through' : ''
                }`}
              >
                <AsnText asn={r.asn} names={asNames} />
                <RpkiMark validity={r.rpki} />
                <span className="sr-only">, route object in {source}. Show object</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null

    return helper.columns([
      helper.accessor('prefix', {
        id: 'prefix',
        header: 'Prefix',
        sortFn: sortWith('prefix'),
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
        sortFn: sortWith('specific'),
      }),
      helper.accessor((r) => r.rir ?? '', {
        id: 'rir',
        header: 'RIR',
        sortFn: sortWith('rir'),
        cell: (info) => <span className="whitespace-nowrap">{info.getValue()}</span>,
      }),
      ...(withGeo
        ? [
            helper.accessor((r) => r.geo?.countries.map((c) => c.code).join(' ') ?? '', {
              id: 'geo',
              header: 'Geo',
              sortFn: sortWith('geo'),
              cell: (info) => <GeoCodes geo={info.row.original.geo} />,
            }),
          ]
        : []),
      helper.accessor((r) => r.bgpOrigins.map((o) => o.asn).join(' '), {
        id: 'bgp',
        header: 'BGP',
        sortFn: sortWith('bgp'),
        cell: (info) => {
          const r = info.row.original
          if (r.bgpOrigins.length === 0) return null
          return (
            <a
              href={lookingGlassUrl(r.prefix)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex flex-wrap gap-x-2 font-mono"
              title="Open in the NLNOG RING looking glass"
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
        sortFn: sortWith('rpki'),
        cell: (info) => (
          <ul className="flex flex-wrap gap-x-2 font-mono">
            {info.row.original.rpkiRoutes.map((roa) => (
              <li key={`${roa.asn}/${roa.maxLength}`} className="whitespace-nowrap">
                <AsnText asn={roa.asn} names={asNames} />
                <span className="text-[var(--muted)]" title="max length">
                  {' '}
                  /{roa.maxLength}
                </span>
              </li>
            ))}
          </ul>
        ),
      }),
      ...sources.map((source) =>
        helper.accessor((r) => (r.irrRoutes[source] ?? []).map((o) => o.asn).join(' '), {
          id: `irr:${source}`,
          header: source,
          sortFn: sortWith(`irr:${source}`),
          cell: (info) =>
            irrCell(info.row.original.prefix, source, info.row.original.irrRoutes[source]),
        }),
      ),
      helper.accessor('categoryOverall', {
        id: 'status',
        header: 'Status',
        enableSorting: false,
        cell: (info) => <CategoryIcon category={info.getValue()} />,
      }),
      helper.accessor((r) => r.messages.map((m) => m.text).join(' '), {
        id: 'advice',
        header: 'Advice',
        sortFn: sortWith('advice'),
        cell: (info) => <MessageList messages={info.row.original.messages} reduced={reduced} />,
      }),
    ])
  }, [sources, withGeo, asNames, reduced, onWhois])

  const columnVisibility = useMemo(() => {
    const v: Record<string, boolean> = { specific: false, status: reduced }
    for (const c of hidden) v[c] = false
    return v
  }, [hidden, reduced])

  const table = useTable({
    features,
    columns,
    data: rows,
    state: { sorting: sort, columnVisibility },
    onSortingChange: (updater) => {
      onSortChange(typeof updater === 'function' ? updater(sort) : updater)
    },
    enableSortingRemoval: false,
  })

  const visibleRows = table.getRowModel().rows

  return (
    <div className="overflow-x-auto border border-[var(--rule)] bg-[var(--panel)] lg:overflow-visible">
      <table className="w-full border-collapse text-[0.82rem]" aria-describedby={`${id}-count`}>
        <thead className="z-10 bg-[var(--sunk)] lg:sticky lg:top-[47px]">
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
                      sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined
                    }
                    className="label border-b border-[var(--rule-strong)] px-3 py-2 text-left whitespace-nowrap"
                  >
                    {header.column.id === 'status' ? (
                      <span className="sr-only">Status</span>
                    ) : header.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 uppercase hover:text-[var(--text)]"
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
          rows={visibleRows}
          colSpan={visibleRows[0]?.getVisibleCells().length ?? 1}
          estimateSize={52}
          renderRow={(row, index, measure) => (
            <tr
              key={row.id}
              data-index={index}
              ref={measure}
              className="border-b border-[var(--rule)] align-top last:border-b-0"
            >
              {row.getVisibleCells().map((cell, i) => (
                <td
                  key={cell.id}
                  className={`px-3 py-2 ${
                    i === 0
                      ? `border-l-[3px] ${reduced ? 'border-l-[var(--rule-strong)]' : edgeClass[row.original.categoryOverall]}`
                      : ''
                  }`}
                >
                  <table.FlexRender cell={cell} />
                </td>
              ))}
            </tr>
          )}
        />
      </table>
    </div>
  )
}

/** Hideable columns for the table view, for the column picker. */
export function hideableColumns(rows: readonly PrefixSummary[]): { id: string; label: string }[] {
  return [
    { id: 'prefix', label: 'Prefix' },
    { id: 'rir', label: 'RIR' },
    ...(hasGeo(rows) ? [{ id: 'geo', label: 'Geo' }] : []),
    { id: 'bgp', label: 'BGP' },
    { id: 'rpki', label: 'RPKI' },
    ...sourcesOf(rows).map((s) => ({ id: `irr:${s}`, label: s })),
    { id: 'advice', label: 'Advice' },
  ]
}
