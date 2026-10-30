import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useHydrated } from '~/lib/use-client'

const VIRTUALIZE_FROM = 120
const SSR_ITEMS = 40

/**
 * A list of variable-height blocks that windows itself once long. SSR and the
 * first client render show a fixed slice so hydration matches.
 */
export function VirtualList<T>({
  items,
  estimateSize,
  getKey,
  renderItem,
  className = '',
  label,
}: {
  items: readonly T[]
  estimateSize: number
  getKey: (item: T) => string
  renderItem: (item: T) => ReactNode
  className?: string
  label: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [margin, setMargin] = useState(0)
  const hydrated = useHydrated()
  const large = items.length >= VIRTUALIZE_FROM
  const virtual = large && hydrated

  useLayoutEffect(() => {
    if (ref.current) setMargin(ref.current.getBoundingClientRect().top + window.scrollY)
  }, [virtual])

  const virtualizer = useWindowVirtualizer({
    count: virtual ? items.length : 0,
    estimateSize: () => estimateSize,
    overscan: 6,
    scrollMargin: margin,
  })

  if (!virtual) {
    return (
      <div ref={ref} role="list" aria-label={label} className={className}>
        {(large ? items.slice(0, SSR_ITEMS) : items).map((item) => (
          <div role="listitem" key={getKey(item)}>
            {renderItem(item)}
          </div>
        ))}
      </div>
    )
  }

  const visible = virtualizer.getVirtualItems()
  const top = visible[0] ? visible[0].start - virtualizer.options.scrollMargin : 0
  return (
    <div
      ref={ref}
      role="list"
      aria-label={label}
      className={className}
      style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
    >
      <div style={{ transform: `translateY(${top}px)` }}>
        {visible.map((v) => (
          <div
            role="listitem"
            key={getKey(items[v.index]!)}
            data-index={v.index}
            ref={virtualizer.measureElement}
          >
            {renderItem(items[v.index]!)}
          </div>
        ))}
      </div>
    </div>
  )
}
