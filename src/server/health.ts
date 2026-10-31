// Tracks the last success and failure per upstream so /healthz can report
// without calling the upstreams on every probe.

export type SourceName = 'irrd' | 'ripestat' | 'bgptools' | 'rirstats' | 'maxmind'

export interface SourceHealth {
  lastSuccess: string | null
  lastFailure: string | null
  lastError: string | null
}

const state = new Map<SourceName, SourceHealth>()

function entry(source: SourceName): SourceHealth {
  let e = state.get(source)
  if (!e) {
    e = { lastSuccess: null, lastFailure: null, lastError: null }
    state.set(source, e)
  }
  return e
}

export function recordSuccess(source: SourceName): void {
  entry(source).lastSuccess = new Date().toISOString()
}

export function recordFailure(source: SourceName, error: unknown): void {
  const e = entry(source)
  e.lastFailure = new Date().toISOString()
  e.lastError = error instanceof Error ? error.message : String(error)
}

export function healthSnapshot(): Record<SourceName, SourceHealth> {
  const sources: SourceName[] = ['irrd', 'ripestat', 'bgptools', 'rirstats', 'maxmind']
  return Object.fromEntries(sources.map((s) => [s, { ...entry(s) }])) as Record<
    SourceName,
    SourceHealth
  >
}

export function resetHealth(): void {
  state.clear()
}
