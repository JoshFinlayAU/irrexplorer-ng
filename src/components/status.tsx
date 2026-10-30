import type { Category, Message, RpkiValidity } from '~/lib/analysis/types'
import { describeValidity } from '~/lib/analysis/rpki'
import {
  DangerIcon,
  InfoIcon,
  InvalidIcon,
  SuccessIcon,
  UnknownIcon,
  ValidIcon,
  WarningIcon,
} from './icons'

export const CATEGORY_LABEL: Record<Category, string> = {
  danger: 'Error',
  warning: 'Warning',
  info: 'Info',
  success: 'OK',
}

const ICONS = { danger: DangerIcon, warning: WarningIcon, info: InfoIcon, success: SuccessIcon }

export const badgeClass: Record<Category, string> = {
  danger: 'bg-[var(--danger-bg)] text-[var(--danger-fg)]',
  warning: 'bg-[var(--warning-bg)] text-[var(--warning-fg)]',
  info: 'bg-[var(--info-bg)] text-[var(--info-fg)]',
  success: 'bg-[var(--success-bg)] text-[var(--success-fg)]',
}

export const rowClass: Record<Category, string> = {
  danger: 'bg-[var(--danger-row)]',
  warning: 'bg-[var(--warning-row)]',
  info: 'bg-[var(--info-row)]',
  success: 'bg-[var(--success-row)]',
}

export function CategoryIcon({ category, className }: { category: Category; className?: string }) {
  const Icon = ICONS[category]
  return <Icon className={className} title={`Status: ${CATEGORY_LABEL[category]}`} />
}

export function MessageBadge({ message, reduced }: { message: Message; reduced: boolean }) {
  const Icon = ICONS[message.category]
  return (
    <span
      className={`inline-flex items-start gap-1.5 rounded px-2 py-0.5 text-[0.8rem] leading-snug ${
        reduced ? 'border border-[var(--border)]' : badgeClass[message.category]
      }`}
    >
      <Icon className="mt-[0.15rem] shrink-0" />
      <span>
        <span className="sr-only">{CATEGORY_LABEL[message.category]}: </span>
        {message.text}
      </span>
    </span>
  )
}

export function MessageList({ messages, reduced }: { messages: Message[]; reduced: boolean }) {
  return (
    <ul className="flex flex-col items-start gap-1">
      {messages.map((m) => (
        <li key={`${m.category}:${m.text}`}>
          <MessageBadge message={m} reduced={reduced} />
        </li>
      ))}
    </ul>
  )
}

/** RPKI state marker: icon plus screen-reader text, never colour alone. */
export function RpkiMark({ validity }: { validity: RpkiValidity }) {
  const label = describeValidity(validity)
  switch (validity.state) {
    case 'valid':
      return <ValidIcon className="inline text-[var(--success-fg)]" title={label} />
    case 'invalid':
      return <InvalidIcon className="inline text-[var(--danger-fg)]" title={label} />
    case 'unknown':
      return <UnknownIcon className="inline text-[var(--muted)]" title={label} />
    case 'not-found':
      return null
  }
}
