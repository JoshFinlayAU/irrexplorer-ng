import type { Notice } from '~/lib/analysis/types'
import { DangerIcon, InfoIcon, WarningIcon } from './icons'
import { badgeClass } from './status'

const ICON = { danger: DangerIcon, warning: WarningIcon, info: InfoIcon }

export function SourceNotices({ notices }: { notices: Notice[] }) {
  if (notices.length === 0) return null
  return (
    <section aria-label="Data source notices" className="mb-4 flex flex-col gap-2">
      {notices.map((n) => {
        const Icon = ICON[n.level]
        return (
          <p
            key={n.text}
            role={n.level === 'danger' ? 'alert' : 'status'}
            className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${badgeClass[n.level]}`}
          >
            <Icon className="mt-0.5 shrink-0" />
            <span>{n.text}</span>
          </p>
        )
      })}
    </section>
  )
}
