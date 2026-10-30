// The prefix sections of a report (records or table view), with a toolbar
// whose every setting lives in the URL so a link reproduces the exact view.
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useId, useMemo, useState, type ReactNode } from 'react'
import type { PrefixSummary } from '~/lib/analysis/types'
import { filterRows, sortRows } from '~/lib/report-rows'
import { cleanSearch, type ReportSearch } from '~/lib/search'
import { PrefixRecords } from './prefix-records'
import { formatSort, hideableColumns, parseSort, PrefixGrid } from './prefix-table'
import { JsonLink, SectionHead, Segmented } from './ui'
import { WhoisDialog, type WhoisTarget } from './whois-dialog'

export interface TableSpec {
  id: string
  sortKey: 'sort' | 'sort2'
  defaultSort: string
  title: ReactNode
  rows: PrefixSummary[]
  jsonHref: string
  emptyText?: string
}

export function useReportUpdate() {
  const navigate = useNavigate()
  return useCallback(
    (patch: Partial<ReportSearch>) =>
      void navigate({
        to: '.',
        search: (prev: ReportSearch) => cleanSearch({ ...prev, ...patch }),
        replace: true,
        resetScroll: false,
      }),
    [navigate],
  )
}

const ORDER_OPTIONS = [
  { value: 'prefix', label: 'Address' },
  { value: 'specific', label: 'Specific' },
  { value: 'advice', label: 'Severity' },
]

function Toolbar({
  search,
  update,
  columns,
}: {
  search: ReportSearch
  update: (p: Partial<ReportSearch>) => void
  columns: { id: string; label: string }[]
}) {
  const filterId = useId()
  const view = search.view ?? 'records'
  const hidden = new Set(search.hide ?? [])
  return (
    <div
      role="toolbar"
      aria-label="Display options"
      className="z-20 -mx-4 lg:sticky lg:top-0 mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-[var(--rule)] bg-[var(--bg)] px-4 py-2 sm:-mx-6 sm:px-6"
    >
      <Segmented
        label="View"
        value={view}
        onChange={(v) => update({ view: v === 'records' ? undefined : v })}
        options={[
          { value: 'records', label: 'Records' },
          { value: 'table', label: 'Table' },
        ]}
      />
      <Segmented
        label="Rows"
        value={search.issues ? 'issues' : 'all'}
        onChange={(v) => update({ issues: v === 'issues' })}
        options={[
          { value: 'all', label: 'All' },
          { value: 'issues', label: 'Errors + warnings' },
        ]}
      />
      <div className="flex min-w-0 items-center gap-2">
        <label htmlFor={filterId} className="label">
          Filter
        </label>
        <input
          id={filterId}
          type="search"
          value={search.filter ?? ''}
          onChange={(e) => update({ filter: e.target.value })}
          placeholder="prefix, ASN, IRR, message"
          className="control w-56 max-w-full placeholder:text-[var(--faint)]"
        />
      </div>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={!!search.reduced}
          onChange={(e) => update({ reduced: e.target.checked })}
          className="accent-[var(--text)]"
        />
        <span className="label">Reduced colour</span>
      </label>
      {view === 'table' ? (
        <details className="relative">
          <summary className="control cursor-pointer list-none">Columns</summary>
          <fieldset className="absolute right-0 z-30 mt-1 flex min-w-44 flex-col gap-1 border border-[var(--rule-strong)] bg-[var(--panel)] p-2">
            <legend className="sr-only">Visible columns</legend>
            {columns.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-2 font-mono text-[0.8rem] whitespace-nowrap"
              >
                <input
                  type="checkbox"
                  checked={!hidden.has(c.id)}
                  className="accent-[var(--text)]"
                  onChange={(e) => {
                    const next = new Set(hidden)
                    if (e.target.checked) next.delete(c.id)
                    else next.add(c.id)
                    update({ hide: [...next] })
                  }}
                />
                {c.label}
              </label>
            ))}
          </fieldset>
        </details>
      ) : null}
    </div>
  )
}

export function ReportTables({
  search,
  tables,
  asNames,
}: {
  search: ReportSearch
  tables: TableSpec[]
  asNames: Record<string, string>
}) {
  const update = useReportUpdate()
  const [whois, setWhois] = useState<WhoisTarget | null>(null)
  const view = search.view ?? 'records'
  const reduced = !!search.reduced
  const columns = useMemo(() => hideableColumns(tables.flatMap((t) => t.rows)), [tables])

  return (
    <>
      <Toolbar search={search} update={update} columns={columns} />
      {tables.map((t) => {
        const sort = parseSort(search[t.sortKey], t.defaultSort)
        const filtered = filterRows(t.rows, {
          filter: search.filter ?? '',
          issuesOnly: !!search.issues,
        })
        const shown = view === 'records' ? sortRows(filtered, sort[0]!) : filtered
        const order = sort[0]!.id
        return (
          <section key={t.id} aria-labelledby={`${t.id}-title`} className="mb-10">
            <SectionHead
              id={`${t.id}-title`}
              title={t.title}
              meta={
                <>
                  <span
                    id={`${t.id}-count`}
                    className="font-mono text-[0.75rem] text-[var(--muted)]"
                  >
                    {shown.length === t.rows.length
                      ? `${t.rows.length} ${t.rows.length === 1 ? 'prefix' : 'prefixes'}`
                      : `${shown.length} of ${t.rows.length} prefixes shown`}
                  </span>
                  {view === 'records' ? (
                    <Segmented
                      label={`Order of ${t.id}`}
                      value={ORDER_OPTIONS.some((o) => o.value === order) ? order : 'prefix'}
                      onChange={(v) => update({ [t.sortKey]: v })}
                      options={ORDER_OPTIONS}
                    />
                  ) : null}
                  <JsonLink href={t.jsonHref} />
                </>
              }
            />
            {shown.length === 0 ? (
              <p className="border border-dashed border-[var(--rule-strong)] px-3 py-6 text-center font-mono text-[0.8rem] text-[var(--muted)]">
                {t.rows.length === 0
                  ? (t.emptyText ?? 'No prefixes were found.')
                  : search.issues && !search.filter
                    ? 'No records with an error or warning status.'
                    : 'No rows match the current filter.'}
              </p>
            ) : view === 'records' ? (
              <PrefixRecords
                rows={shown}
                asNames={asNames}
                reduced={reduced}
                onWhois={setWhois}
                label={`Prefixes in ${t.id}`}
              />
            ) : (
              <PrefixGrid
                id={t.id}
                rows={shown}
                asNames={asNames}
                sort={sort}
                onSortChange={(s) => update({ [t.sortKey]: formatSort(s) })}
                hidden={search.hide ?? []}
                reduced={reduced}
                onWhois={setWhois}
              />
            )}
          </section>
        )
      })}
      {whois ? <WhoisDialog target={whois} onClose={() => setWhois(null)} /> : null}
    </>
  )
}
