import { Link, type ErrorComponentProps } from '@tanstack/react-router'
import { SearchForm } from './search-form'

export function Pending({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 py-10 text-[var(--muted)]"
    >
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
      <span>{label}…</span>
    </div>
  )
}

export function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-16">
      <h1 className="mb-2 text-2xl font-semibold">Page not found</h1>
      <p className="mb-6 text-[var(--muted)]">
        That address does not match a prefix, ASN or set page. Try a search instead.
      </p>
      <SearchForm large />
      <p className="mt-6">
        <Link to="/">Back to the start page</Link>
      </p>
    </div>
  )
}

export function DefaultError({ error, reset }: ErrorComponentProps) {
  return (
    <div role="alert" className="mx-auto max-w-xl py-16">
      <h1 className="mb-2 text-2xl font-semibold">Something went wrong</h1>
      <p className="mb-4 text-[var(--muted)]">
        {error instanceof Error && error.message ? error.message : 'An unexpected error occurred.'}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--accent-contrast)]"
      >
        Try again
      </button>
    </div>
  )
}
