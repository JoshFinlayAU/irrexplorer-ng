import { useNowMinute } from '~/lib/use-client'

/** Deterministic UTC rendering, identical on server and client. */
export function formatUtc(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

function relative(iso: string, now: number): string {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000)
  const abs = Math.abs(seconds)
  const units: [number, string][] = [
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
  ]
  for (const [size, name] of units) {
    if (abs >= size) {
      const n = Math.floor(abs / size)
      return seconds >= 0
        ? `${n} ${name}${n === 1 ? '' : 's'} ago`
        : `in ${n} ${name}${n === 1 ? '' : 's'}`
    }
  }
  return 'just now'
}

/** "2 hours ago (2026-10-30 04:00 UTC)". The relative part is added after hydration only. */
export function Timestamp({ iso }: { iso: string | null }) {
  const now = useNowMinute()
  if (!iso) return <span className="text-[var(--muted)]">never</span>
  return (
    <time dateTime={iso}>
      {now !== null ? `${relative(iso, now)} (${formatUtc(iso)})` : formatUtc(iso)}
    </time>
  )
}
