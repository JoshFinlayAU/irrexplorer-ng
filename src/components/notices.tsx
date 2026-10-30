import type { Notice } from '~/lib/analysis/types'
import { SeverityTag } from './status'

const SOURCE: Record<Notice['source'], string> = {
  irr: 'irrd',
  bgp: 'bgp',
  rpki: 'rpki',
  rir: 'rir',
  ripestat: 'ripestat',
}

/** Partial-failure notices, one line per degraded source, like a log tail. */
export function SourceNotices({ notices }: { notices: Notice[] }) {
  if (notices.length === 0) return null
  return (
    <section
      aria-label="Data source notices"
      className="mb-6 border border-[var(--rule-strong)] bg-[var(--panel)]"
    >
      {notices.map((n) => (
        <p
          key={n.text}
          role={n.level === 'danger' ? 'alert' : 'status'}
          className="grid grid-cols-[auto_5.5rem_1fr] items-baseline gap-x-3 border-b border-[var(--rule)] px-3 py-1.5 text-[0.85rem] last:border-b-0"
        >
          <SeverityTag category={n.level} />
          <span className="font-mono text-[0.75rem] text-[var(--muted)]">{SOURCE[n.source]}</span>
          <span>{n.text}</span>
        </p>
      ))}
    </section>
  )
}
