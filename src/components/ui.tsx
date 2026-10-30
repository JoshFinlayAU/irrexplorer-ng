// Small layout primitives shared by every view: section heads, key/value
// strips, segmented controls, meters and a copy button.
import { useState, type ReactNode } from 'react'

export function SectionHead({
  id,
  title,
  meta,
  level = 2,
}: {
  id?: string
  title: ReactNode
  meta?: ReactNode
  level?: 2 | 3
}) {
  const H = level === 2 ? 'h2' : 'h3'
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <H id={id} className="text-[0.95rem] font-semibold tracking-tight">
        {title}
      </H>
      <span
        aria-hidden="true"
        className="min-w-8 flex-1 translate-y-[-0.2em] border-b border-[var(--rule)]"
      />
      {meta ? <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">{meta}</div> : null}
    </div>
  )
}

export interface Fact {
  label: string
  value: ReactNode
  wide?: boolean
}

/** A ruled strip of labelled facts, like the header of a datasheet. */
export function FactStrip({ facts, label }: { facts: Fact[]; label: string }) {
  if (facts.length === 0) return null
  return (
    <dl aria-label={label} className="flex flex-wrap border-t border-l border-[var(--rule)]">
      {facts.map((f) => (
        <div
          key={f.label}
          className={`min-w-0 border-r border-b border-[var(--rule)] px-3 py-2 ${f.wide ? 'grow-[2] basis-[20rem]' : 'grow basis-[10rem]'}`}
        >
          <dt className="label mb-0.5">{f.label}</dt>
          <dd className="font-mono text-[0.85rem] break-words">{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Radio-like button group. Each option is a real button with aria-pressed. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`control ${i > 0 ? '-ml-px' : ''}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A proportional bar of counts, with the numbers alongside in text. */
export function StackBar({
  parts,
  label,
}: {
  parts: { key: string; value: number; className: string; title: string }[]
  label: string
}) {
  const total = parts.reduce((n, p) => n + p.value, 0)
  if (total === 0) return null
  return (
    <div role="img" aria-label={label} className="flex h-1.5 w-full gap-px bg-[var(--rule)]">
      {parts
        .filter((p) => p.value > 0)
        .map((p) => (
          <div
            key={p.key}
            title={`${p.title}: ${p.value}`}
            className={p.className}
            style={{ width: `${(p.value / total) * 100}%` }}
          />
        ))}
    </div>
  )
}

export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <span className="inline-flex items-center gap-2">
      <span
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className="relative inline-block h-1.5 w-20 bg-[var(--rule)]"
      >
        <span className="absolute inset-y-0 left-0 bg-[var(--text)]" style={{ width: `${pct}%` }} />
      </span>
    </span>
  )
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="control"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(
          () => {
            setDone(true)
            setTimeout(() => setDone(false), 1500)
          },
          () => undefined,
        )
      }}
    >
      {done ? 'Copied' : label}
    </button>
  )
}

export function JsonLink({ href }: { href: string }) {
  return (
    <a href={href} className="label hover:text-[var(--text)]">
      Source data as JSON
    </a>
  )
}

/** Page title block: a type label above the query, set large in mono. */
export function PageTitle({
  kind,
  children,
  sub,
}: {
  kind: string
  children: ReactNode
  sub?: ReactNode
}) {
  return (
    <header className="mb-5">
      <h1 className="flex flex-col gap-1">
        <span className="label">Report for {kind}</span>{' '}
        <span className="font-mono text-[1.9rem] leading-none font-medium tracking-tight break-all sm:text-[2.3rem]">
          {children}
        </span>
      </h1>
      {sub ? <p className="mt-2 text-[var(--muted)]">{sub}</p> : null}
    </header>
  )
}
