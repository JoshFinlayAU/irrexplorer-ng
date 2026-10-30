import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useHydrated } from '~/lib/use-client'

const VIRTUALIZE_FROM = 250
const SSR_ROWS = 60

/**
 * A <tbody> that windows its rows once there are many, keeping real table
 * semantics (spacer rows above and below). SSR and the first client render
 * show a fixed slice so hydration matches; the virtualizer takes over after.
 */
export function VirtualRows<T>({
  rows,
  colSpan,
  estimateSize = 44,
  renderRow,
}: {
  rows: readonly T[]
  colSpan: number
  estimateSize?: number
  renderRow: (
    row: T,
    index: number,
    measure?: (el: HTMLTableRowElement | null) => void,
  ) => ReactNode
}) {
  const ref = useRef<HTMLTableSectionElement>(null)
  const [margin, setMargin] = useState(0)
  const hydrated = useHydrated()
  const large = rows.length >= VIRTUALIZE_FROM
  const virtual = large && hydrated

  useLayoutEffect(() => {
    if (ref.current) setMargin(ref.current.getBoundingClientRect().top + window.scrollY)
  }, [virtual])

  const virtualizer = useWindowVirtualizer({
    count: virtual ? rows.length : 0,
    estimateSize: () => estimateSize,
    overscan: 12,
    scrollMargin: margin,
  })

  if (!virtual) {
    return (
      <tbody ref={ref}>
        {(large ? rows.slice(0, SSR_ROWS) : rows).map((r, i) => renderRow(r, i))}
      </tbody>
    )
  }

  const items = virtualizer.getVirtualItems()
  const top = items[0] ? items[0].start - virtualizer.options.scrollMargin : 0
  const bottom = items.length > 0 ? virtualizer.getTotalSize() - items[items.length - 1]!.end : 0
  return (
    <tbody ref={ref}>
      {top > 0 ? (
        <tr aria-hidden="true">
          <td colSpan={colSpan} style={{ height: top, padding: 0 }} />
        </tr>
      ) : null}
      {items.map((item) => renderRow(rows[item.index]!, item.index, virtualizer.measureElement))}
      {bottom > 0 ? (
        <tr aria-hidden="true">
          <td colSpan={colSpan} style={{ height: bottom, padding: 0 }} />
        </tr>
      ) : null}
    </tbody>
  )
}
