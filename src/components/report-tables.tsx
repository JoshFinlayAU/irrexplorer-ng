// Display options plus one or more prefix tables, all driven by URL search params.
import { useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { PrefixSummary } from '~/lib/analysis/types'
import { cleanSearch, type ReportSearch } from '~/lib/search'
import { DisplayOptions } from './display-options'
import { formatSort, parseSort, PrefixTable } from './prefix-table'

export interface TableSpec {
  id: string
  sortKey: 'sort' | 'sort2'
  defaultSort: string
  title: ReactNode
  rows: PrefixSummary[]
  jsonHref: string
  emptyText?: string
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
  const navigate = useNavigate()
  const update = (patch: Partial<ReportSearch>) =>
    void navigate({
      to: '.',
      search: (prev: ReportSearch) => cleanSearch({ ...prev, ...patch }),
      replace: true,
      resetScroll: false,
    })

  return (
    <>
      <DisplayOptions
        value={{ reduced: !!search.reduced, issues: !!search.issues, filter: search.filter ?? '' }}
        onChange={(v) =>
          update({
            ...(v.reduced !== undefined && { reduced: v.reduced }),
            ...(v.issues !== undefined && { issues: v.issues }),
            ...(v.filter !== undefined && { filter: v.filter }),
          })
        }
      />
      {tables.map((t) => (
        <PrefixTable
          key={t.id}
          id={t.id}
          title={t.title}
          rows={t.rows}
          asNames={asNames}
          sort={parseSort(search[t.sortKey], t.defaultSort)}
          onSortChange={(s) => update({ [t.sortKey]: formatSort(s) })}
          hidden={search.hide ?? []}
          onHiddenChange={(h) => update({ hide: h })}
          reduced={!!search.reduced}
          issuesOnly={!!search.issues}
          filter={search.filter ?? ''}
          jsonHref={t.jsonHref}
          emptyText={t.emptyText}
        />
      ))}
    </>
  )
}
