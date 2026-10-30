import { Link, type ErrorComponentProps } from '@tanstack/react-router'
import { SearchForm } from './search-form'

export function Pending({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="max-w-xl py-10">
      <p className="mb-3 font-mono text-[0.85rem]">
        {label}
        <span className="animate-pulse">_</span>
      </p>
      <div aria-hidden="true" className="relative h-px overflow-hidden bg-[var(--rule)]">
        <div className="absolute inset-y-0 w-1/4 bg-[var(--text)] motion-safe:animate-[scan_1.4s_linear_infinite]" />
      </div>
      <p className="mt-3 font-mono text-[0.72rem] text-[var(--faint)]">
        Large ASNs and sets can take a minute or more on a cold cache.
      </p>
    </div>
  )
}

export function NotFound() {
  return (
    <div className="max-w-2xl py-12">
      <p className="label mb-1">404</p>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mb-6 text-[var(--muted)]">
        That address does not match a prefix, ASN or set page. Try a search instead.
      </p>
      <SearchForm large />
      <p className="mt-6 font-mono text-[0.8rem]">
        <Link to="/">Back to the start page</Link>
      </p>
    </div>
  )
}

export function DefaultError({ error, reset }: ErrorComponentProps) {
  return (
    <div role="alert" className="max-w-2xl py-12">
      <p className="label mb-1 text-[var(--danger-fg)]">error</p>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <pre className="mb-4 border border-[var(--rule)] bg-[var(--panel)] p-3 font-mono text-[0.8rem] whitespace-pre-wrap text-[var(--muted)]">
        {error instanceof Error && error.message ? error.message : 'An unexpected error occurred.'}
      </pre>
      <button type="button" onClick={reset} className="control">
        Try again
      </button>
    </div>
  )
}

/** Shown when the URL holds something that cannot be queried. */
export function InvalidQuery({
  what,
  raw,
  error,
}: {
  what: string
  raw: string
  error: string | null
}) {
  return (
    <div className="max-w-2xl py-8">
      <p className="label mb-1 text-[var(--danger-fg)]">invalid input</p>
      <h1 className="mb-3 text-2xl font-semibold tracking-tight">Not a valid {what}</h1>
      <p role="alert" className="font-mono text-[0.9rem]">
        <span className="bg-[var(--danger-tint)] px-1 text-[var(--danger-fg)]">{raw}</span>
        <span className="text-[var(--muted)]"> : {error}</span>
      </p>
    </div>
  )
}
