// The address map: every overlapping prefix drawn to scale inside the least
// specific one, one lane per nesting level. Space with no prefix shows as a
// gap, so unannounced or unregistered holes are visible at a glance.
import { Link } from '@tanstack/react-router'
import { covers, formatIp, lastAddress, parsePrefix, prefixSize, type Prefix } from '~/lib/ip'
import type { Category, PrefixSummary } from '~/lib/analysis/types'
import { CATEGORY_LABEL } from './status'

const MAX_BARS = 400
const LANE = 24

const fill: Record<Category, string> = {
  danger: 'bg-[var(--danger-tint)] text-[var(--danger-fg)] border-[var(--danger-fg)]',
  warning: 'bg-[var(--warning-tint)] text-[var(--warning-fg)] border-[var(--warning-fg)]',
  info: 'bg-[var(--info-tint)] text-[var(--info-fg)] border-[var(--info-fg)]',
  success: 'bg-[var(--success-tint)] text-[var(--success-fg)] border-[var(--success-fg)]',
}

interface Bar {
  prefix: Prefix
  row: PrefixSummary
  depth: number
  left: number
  width: number
}

/** Fraction of the root's address range, in percent, with bigint precision. */
function pct(offset: bigint, total: bigint): number {
  return Number((offset * 10_000_000n) / total) / 100_000
}

export function layoutBars(rows: readonly PrefixSummary[], query: Prefix) {
  const parsed = rows
    .map((row) => ({ row, prefix: parsePrefix(row.prefix) }))
    .filter((x): x is { row: PrefixSummary; prefix: Prefix } => x.prefix?.version === query.version)
    .sort((a, b) => a.prefix.length - b.prefix.length)
  if (parsed.length === 0 || parsed.length > MAX_BARS) return null
  const root = parsed[0]!.prefix.length <= query.length ? parsed[0]!.prefix : query
  const total = prefixSize(root)
  const bars: Bar[] = parsed
    .filter((x) => covers(root, x.prefix))
    .map((x, i, all) => {
      let depth = 0
      for (let j = 0; j < i; j++) {
        const other = all[j]!.prefix
        if (other.length < x.prefix.length && covers(other, x.prefix)) depth++
      }
      return {
        ...x,
        depth,
        left: pct(x.prefix.network - root.network, total),
        width: pct(prefixSize(x.prefix), total),
      }
    })
  const lanes = Math.max(0, ...bars.map((b) => b.depth)) + 1
  return { root, bars, lanes }
}

export function AddressMap({
  rows,
  query,
  reduced,
}: {
  rows: readonly PrefixSummary[]
  query: Prefix
  reduced: boolean
}) {
  const layout = layoutBars(rows, query)
  if (!layout || layout.bars.length < 2) return null
  const { root, bars, lanes } = layout
  const total = prefixSize(root)
  const qLeft = pct(query.network - root.network, total)
  const qWidth = pct(prefixSize(query), total)
  return (
    <section aria-labelledby="map-title" className="mb-8">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-4">
        <h2 id="map-title" className="text-[0.95rem] font-semibold tracking-tight">
          Address space
        </h2>
        <p className="font-mono text-[0.75rem] text-[var(--muted)]">
          {bars.length} prefixes inside {root.cidr}, {lanes} {lanes === 1 ? 'level' : 'levels'}{' '}
          deep. Gaps are space with no BGP, IRR or ROA entry.
        </p>
      </div>
      <p className="sr-only">
        Map of {bars.length} prefixes inside {root.cidr}. The same prefixes are listed as records
        below.
      </p>
      <div
        aria-hidden="true"
        className="relative border border-[var(--rule)] bg-[var(--sunk)]"
        style={{ height: lanes * LANE + 8 }}
      >
        {root.cidr !== query.cidr ? (
          <div
            aria-hidden="true"
            className="absolute inset-y-0 border-x border-dashed border-[var(--text)] bg-[var(--hl)]/50"
            style={{ left: `${qLeft}%`, width: `max(${qWidth}%, 2px)` }}
          />
        ) : null}
        {bars.map((b) => (
          <Link
            key={b.prefix.cidr}
            to="/prefix/$"
            params={{ _splat: b.prefix.cidr }}
            tabIndex={-1}
            aria-hidden="true"
            title={`${b.prefix.cidr}: ${CATEGORY_LABEL[b.row.categoryOverall]}${
              b.row.bgpOrigins.length
                ? `, origin ${b.row.bgpOrigins.map((o) => `AS${o.asn}`).join(' ')}`
                : ', not in BGP'
            }`}
            className={`absolute flex items-center overflow-hidden border px-1 font-mono text-[0.68rem] whitespace-nowrap no-underline hover:z-10 hover:outline hover:outline-1 hover:outline-[var(--text)] ${
              reduced
                ? 'border-[var(--rule-strong)] bg-[var(--panel)] text-[var(--text)]'
                : fill[b.row.categoryOverall]
            } ${b.row.bgpOrigins.length === 0 ? 'border-dashed' : ''}`}
            style={{
              left: `${b.left}%`,
              width: `max(${b.width}%, 5px)`,
              top: 4 + b.depth * LANE,
              height: LANE - 4,
            }}
          >
            {b.width > 9 ? b.prefix.cidr : ''}
          </Link>
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[0.7rem] text-[var(--faint)]">
        <span>{formatIp(root.version, root.network)}</span>
        <span>{formatIp(root.version, lastAddress(root))}</span>
      </div>
      <p className="mt-1 font-mono text-[0.7rem] text-[var(--faint)]">
        Solid outline: seen in BGP. Dashed: IRR or ROA only.
        {root.cidr !== query.cidr ? ' Highlighted band: the queried prefix.' : ''}
      </p>
    </section>
  )
}
