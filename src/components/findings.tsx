// Findings: every advice message on the page grouped across prefixes, in the
// style of compiler diagnostics. Clicking a prefix or a message narrows the
// records below to it through the URL filter.
import { useState } from 'react'
import { CATEGORY_ORDER, type Category, type PrefixSummary } from '~/lib/analysis/types'
import { byAddress } from '~/lib/report-rows'
import { CATEGORY_LABEL, SeverityTag, barClass } from './status'
import { StackBar } from './ui'

interface Finding {
  category: Category
  text: string
  prefixes: string[]
}

const GOOD = 'Everything looks good'

export function groupFindings(rows: readonly PrefixSummary[]): Finding[] {
  const map = new Map<string, Finding>()
  for (const r of rows) {
    for (const m of r.messages) {
      if (m.category === 'success') continue
      const key = `${m.category}|${m.text}`
      let f = map.get(key)
      if (!f) {
        f = { category: m.category, text: m.text, prefixes: [] }
        map.set(key, f)
      }
      if (!f.prefixes.includes(r.prefix)) f.prefixes.push(r.prefix)
    }
  }
  const rank = (c: Category) => CATEGORY_ORDER.indexOf(c)
  return [...map.values()]
    .map((f) => ({ ...f, prefixes: f.prefixes.sort(byAddress) }))
    .sort(
      (a, b) =>
        rank(a.category) - rank(b.category) ||
        b.prefixes.length - a.prefixes.length ||
        a.text.localeCompare(b.text),
    )
}

export function countByCategory(rows: readonly PrefixSummary[]): Record<Category, number> {
  const c: Record<Category, number> = { danger: 0, warning: 0, info: 0, success: 0 }
  for (const r of rows) c[r.categoryOverall]++
  return c
}

const SHOWN = 6

function FindingRow({
  f,
  reduced,
  onFilter,
}: {
  f: Finding
  reduced: boolean
  onFilter: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const shown = open ? f.prefixes : f.prefixes.slice(0, SHOWN)
  return (
    <li className="grid grid-cols-[auto_1fr] gap-x-3 border-b border-[var(--rule)] py-2 last:border-b-0 sm:grid-cols-[auto_minmax(16rem,26rem)_1fr]">
      <SeverityTag category={f.category} reduced={reduced} className="mt-0.5" />
      <div className="text-[0.9rem]">
        <button
          type="button"
          onClick={() => onFilter(f.text)}
          title="Show only prefixes with this finding"
          className="text-left hover:underline"
        >
          {f.text}
        </button>
        <span className="ml-2 font-mono text-[0.75rem] text-[var(--muted)]">
          x{f.prefixes.length}
        </span>
      </div>
      <ul
        aria-label={`Prefixes with: ${f.text}`}
        className="col-span-2 mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[0.78rem] sm:col-span-1 sm:mt-0"
      >
        {shown.map((p) => (
          <li key={p}>
            <button
              type="button"
              onClick={() => onFilter(p)}
              className="text-[var(--muted)] hover:text-[var(--text)] hover:underline"
            >
              {p}
            </button>
          </li>
        ))}
        {f.prefixes.length > SHOWN ? (
          <li>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
              className="label hover:text-[var(--text)]"
            >
              {open ? 'fewer' : `+${f.prefixes.length - SHOWN} more`}
            </button>
          </li>
        ) : null}
      </ul>
    </li>
  )
}

export function Findings({
  rows,
  reduced,
  onFilter,
  scope,
}: {
  rows: readonly PrefixSummary[]
  reduced: boolean
  onFilter: (v: string) => void
  scope: string
}) {
  const findings = groupFindings(rows)
  const counts = countByCategory(rows)
  const total = rows.length
  return (
    <section aria-labelledby="findings-title" className="mb-8">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <h2 id="findings-title" className="text-[0.95rem] font-semibold tracking-tight">
          Findings
        </h2>
        <p className="font-mono text-[0.78rem] text-[var(--muted)]">
          {total} {total === 1 ? 'prefix' : 'prefixes'} {scope}
          {CATEGORY_ORDER.map((c) =>
            counts[c] > 0 ? (
              <span key={c}>
                <span className="px-2 text-[var(--faint)]">/</span>
                {counts[c]} {CATEGORY_LABEL[c].toLowerCase()}
              </span>
            ) : null,
          )}
        </p>
      </div>
      <StackBar
        label={`Prefix status: ${CATEGORY_ORDER.map((c) => `${counts[c]} ${CATEGORY_LABEL[c]}`).join(', ')}`}
        parts={CATEGORY_ORDER.map((c) => ({
          key: c,
          value: counts[c],
          className: reduced ? 'bg-[var(--rule-strong)]' : barClass[c],
          title: CATEGORY_LABEL[c],
        }))}
      />
      {findings.length === 0 ? (
        <p className="mt-3 flex items-center gap-3 text-[0.9rem]">
          <SeverityTag category="success" reduced={reduced} />
          {total === 0 ? 'Nothing to check.' : `${GOOD}: no issues on any prefix.`}
        </p>
      ) : (
        <ul className="mt-1">
          {findings.map((f) => (
            <FindingRow
              key={`${f.category}|${f.text}`}
              f={f}
              reduced={reduced}
              onFilter={onFilter}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
