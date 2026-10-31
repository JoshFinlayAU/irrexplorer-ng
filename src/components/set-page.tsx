import { useSuspenseQuery } from '@tanstack/react-query'
import { useId, useMemo } from 'react'
import { ROW_LIMIT } from '~/lib/analysis/sets'
import { Link } from '@tanstack/react-router'
import type { PdbNetRef, SetExpansion } from '~/lib/analysis/types'
import { setQuery } from '~/lib/queries'
import { useRecordRecent } from '~/lib/recent'
import { MemberOfSection } from './member-of-section'
import { SetExpansionTable, type SetTableState } from './set-tables'
import { SetTree, flatten } from './set-tree'
import { SeverityTag } from './status'
import { CopyButton, FactStrip, JsonLink, PageTitle, SectionHead, Segmented } from './ui'

function counts(e: SetExpansion) {
  const loops = e.rows.reduce((n, r) => n + r.loops.length, 0)
  const missing = new Set(Object.values(e.sets).flatMap((s) => s.missing)).size
  return { loops, missing }
}

function Flattened({ expansion }: { expansion: SetExpansion }) {
  const { asns, prefixes } = useMemo(() => flatten(expansion), [expansion])
  const blocks = [
    { label: 'ASNs', list: asns },
    { label: 'Prefixes', list: prefixes },
  ].filter((b) => b.list.length > 0)
  if (blocks.length === 0) return null
  return (
    <section aria-labelledby="flat-title" className="mb-10">
      <SectionHead
        id="flat-title"
        title="Flattened members"
        meta={
          <span className="font-mono text-[0.75rem] text-[var(--muted)]">
            what a filter generator would build from this set
          </span>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {blocks.map((b) => (
          <div key={b.label} className="border border-[var(--rule)] bg-[var(--panel)]">
            <div className="flex items-center justify-between border-b border-[var(--rule)] px-3 py-1.5">
              <span className="label">
                {b.label}{' '}
                <span className="text-[var(--text)]">{b.list.length.toLocaleString('en-US')}</span>
              </span>
              <CopyButton text={b.list.join('\n')} label={`Copy ${b.label}`} />
            </div>
            <pre
              tabIndex={0}
              role="region"
              aria-label={`${b.label} in the expansion`}
              className="max-h-64 overflow-auto px-3 py-2 font-mono text-[0.75rem] leading-relaxed whitespace-pre-wrap text-[var(--muted)]"
            >
              {b.list.join('  ')}
            </pre>
          </div>
        ))}
      </div>
    </section>
  )
}

export function SetPage({
  name,
  category,
  state,
  onChange,
}: {
  name: string
  category: 'as-set' | 'route-set'
  state: SetTableState
  onChange: (next: Partial<SetTableState>) => void
}) {
  const { data } = useSuspenseQuery(setQuery(name, category))
  const filterId = useId()
  useRecordRecent({ path: `/${category}/${name}`, label: name, kind: category })

  return (
    <div>
      <PageTitle kind={category}>{name}</PageTitle>
      {!data.ok ? (
        <p
          role="alert"
          className="mb-8 grid grid-cols-[auto_1fr] items-baseline gap-3 border border-[var(--rule-strong)] bg-[var(--panel)] px-3 py-2 text-sm"
        >
          <SeverityTag category="danger" />
          IRRd unavailable: {data.error}. The set could not be expanded.
        </p>
      ) : !data.expansion.found ? (
        <p className="mb-8 border border-dashed border-[var(--rule-strong)] px-3 py-6 text-center font-mono text-[0.85rem] text-[var(--muted)]">
          {category} was not found.
        </p>
      ) : (
        <Expansion
          data={data.expansion}
          listedBy={data.listedBy}
          state={state}
          onChange={onChange}
          filterId={filterId}
        />
      )}
      <MemberOfSection
        target={name}
        objectClass={category}
        title="Included in the following sets:"
      />
    </div>
  )
}

/** Networks naming this AS-set as theirs in PeeringDB, the set peers build filters from. */
function listedByFact(listedBy: PdbNetRef[]) {
  return {
    label: 'Named in PeeringDB by',
    value:
      listedBy.length === 0 ? (
        <span className="text-[var(--faint)]">no network</span>
      ) : (
        <span className="flex flex-col">
          {listedBy.map((n) => (
            <span key={n.id} className="flex flex-wrap gap-x-2">
              <Link to="/asn/$asn" params={{ asn: `AS${n.asn}` }}>
                AS{n.asn}
              </Link>
              <span className="text-[var(--muted)]">{n.name}</span>
            </span>
          ))}
        </span>
      ),
    wide: true,
  }
}

function Expansion({
  data,
  listedBy,
  state,
  onChange,
  filterId,
}: {
  data: SetExpansion
  listedBy: PdbNetRef[] | null
  state: SetTableState
  onChange: (next: Partial<SetTableState>) => void
  filterId: string
}) {
  const { loops, missing } = counts(data)
  const flat = useMemo(() => flatten(data), [data])
  return (
    <>
      <div className="mb-6">
        <FactStrip
          label="Expansion facts"
          facts={[
            { label: 'Sets resolved', value: data.totalSets },
            { label: 'Depth', value: data.depthReached },
            { label: 'ASNs', value: flat.asns.length.toLocaleString('en-US') },
            { label: 'Prefixes', value: flat.prefixes.length.toLocaleString('en-US') },
            {
              label: 'Loops',
              value: <span className={loops ? 'text-[var(--danger-fg)]' : ''}>{loops}</span>,
            },
            {
              label: 'Missing sets',
              value: <span className={missing ? 'text-[var(--warning-fg)]' : ''}>{missing}</span>,
            },
            ...(listedBy ? [listedByFact(listedBy)] : []),
          ]}
        />
      </div>
      {data.truncated ? (
        <p
          role="status"
          className="mb-6 grid grid-cols-[auto_1fr] items-baseline gap-3 border border-[var(--rule-strong)] bg-[var(--panel)] px-3 py-2 text-sm"
        >
          <SeverityTag category="warning" />
          <span>
            Truncated: expansion stops beyond {data.limit} total {data.category}s or{' '}
            {ROW_LIMIT.toLocaleString('en-US')} paths. Sets past the limit are marked not expanded.
          </span>
        </p>
      ) : null}
      <section aria-labelledby="expansion-title" className="mb-10">
        <SectionHead
          id="expansion-title"
          title="Expands to:"
          meta={<JsonLink href={`/api/sets/expand/${data.root}`} />}
        />
        <div
          role="toolbar"
          aria-label="Expansion display options"
          className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2"
        >
          <Segmented
            label="Layout"
            value={state.layout}
            onChange={(v) => onChange({ layout: v })}
            options={[
              { value: 'tree', label: 'Tree' },
              { value: 'table', label: 'Paths' },
            ]}
          />
          <Segmented
            label="Show"
            value={state.problems ? 'problems' : 'all'}
            onChange={(v) => onChange({ problems: v === 'problems' })}
            options={[
              { value: 'all', label: 'All' },
              { value: 'problems', label: 'Loops + missing' },
            ]}
          />
          <div className="flex items-center gap-2">
            <label htmlFor={filterId} className="label">
              Filter
            </label>
            <input
              id={filterId}
              type="search"
              value={state.filter}
              onChange={(e) => onChange({ filter: e.target.value })}
              placeholder="set, source or member"
              className="control w-56 placeholder:text-[var(--faint)]"
            />
          </div>
        </div>
        {state.layout === 'tree' ? (
          <SetTree expansion={data} filter={state.filter} problems={state.problems} />
        ) : (
          <SetExpansionTable expansion={data} state={state} onChange={onChange} />
        )}
      </section>
      <Flattened expansion={data} />
    </>
  )
}
