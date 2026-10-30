import type { Category, Message, RpkiValidity } from '~/lib/analysis/types'
import { describeValidity } from '~/lib/analysis/rpki'
import { InvalidIcon, UnknownIcon, ValidIcon } from './icons'

export const CATEGORY_LABEL: Record<Category, string> = {
  danger: 'Error',
  warning: 'Warning',
  info: 'Info',
  success: 'OK',
}

/** Fixed-width codes, like a compiler's diagnostics. */
export const CATEGORY_CODE: Record<Category, string> = {
  danger: 'ERR',
  warning: 'WRN',
  info: 'INF',
  success: 'OK',
}

export const fgClass: Record<Category, string> = {
  danger: 'text-[var(--danger-fg)]',
  warning: 'text-[var(--warning-fg)]',
  info: 'text-[var(--info-fg)]',
  success: 'text-[var(--success-fg)]',
}

export const badgeClass: Record<Category, string> = {
  danger: 'bg-[var(--danger-tint)] text-[var(--danger-fg)]',
  warning: 'bg-[var(--warning-tint)] text-[var(--warning-fg)]',
  info: 'bg-[var(--info-tint)] text-[var(--info-fg)]',
  success: 'bg-[var(--success-tint)] text-[var(--success-fg)]',
}

/** Left edge rule colour for a record of this category. */
export const edgeClass: Record<Category, string> = {
  danger: 'border-l-[var(--danger-fg)]',
  warning: 'border-l-[var(--warning-fg)]',
  info: 'border-l-[var(--info-fg)]',
  success: 'border-l-[var(--success-fg)]',
}

export const barClass: Record<Category, string> = {
  danger: 'bg-[var(--danger-fg)]',
  warning: 'bg-[var(--warning-fg)]',
  info: 'bg-[var(--info-fg)]',
  success: 'bg-[var(--success-fg)]',
}

/** A severity code tag. Text, not colour, carries the meaning. */
export function SeverityTag({
  category,
  reduced = false,
  className = '',
}: {
  category: Category
  reduced?: boolean
  className?: string
}) {
  return (
    <span
      title={CATEGORY_LABEL[category]}
      className={`inline-block w-[3.1em] shrink-0 py-px text-center font-mono text-[0.68rem] font-semibold tracking-wider ${
        reduced ? 'border border-[var(--rule-strong)]' : badgeClass[category]
      } ${className}`}
    >
      <span aria-hidden="true">{CATEGORY_CODE[category]}</span>
      <span className="sr-only">{CATEGORY_LABEL[category]}</span>
    </span>
  )
}

/** Kept for the table view: a tag labelled "Status: X". */
export function CategoryIcon({ category }: { category: Category }) {
  return (
    <span role="img" aria-label={`Status: ${CATEGORY_LABEL[category]}`}>
      <SeverityTag category={category} />
    </span>
  )
}

export function MessageBadge({ message, reduced }: { message: Message; reduced: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-2 text-[0.84rem] leading-snug">
      <SeverityTag category={message.category} reduced={reduced} />
      <span>
        <span className="sr-only">: </span>
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

/** RPKI state marker: icon plus accessible text, never colour alone. */
export function RpkiMark({ validity }: { validity: RpkiValidity }) {
  const label = describeValidity(validity)
  switch (validity.state) {
    case 'valid':
      return <ValidIcon className="inline shrink-0 text-[var(--success-fg)]" title={label} />
    case 'invalid':
      return <InvalidIcon className="inline shrink-0 text-[var(--danger-fg)]" title={label} />
    case 'unknown':
      return <UnknownIcon className="inline shrink-0 text-[var(--faint)]" title={label} />
    case 'not-found':
      return null
  }
}

/** RPKI state as a short word, for places with room for text. */
export function RpkiWord({ validity }: { validity: RpkiValidity }) {
  const word =
    validity.state === 'invalid'
      ? validity.reason === 'length'
        ? 'invalid len'
        : 'invalid as'
      : validity.state === 'not-found'
        ? 'not found'
        : validity.state
  const cls =
    validity.state === 'valid'
      ? 'text-[var(--success-fg)]'
      : validity.state === 'invalid'
        ? 'text-[var(--danger-fg)]'
        : 'text-[var(--faint)]'
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[0.72rem] ${cls}`}>
      <RpkiMark validity={validity} />
      <span aria-hidden="true">{word}</span>
    </span>
  )
}
