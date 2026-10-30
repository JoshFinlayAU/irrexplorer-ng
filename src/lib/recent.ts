// Recently viewed queries, kept in this browser only. Everything here is a
// convenience: storage may be blocked, and the server never sees it.
import { useEffect, useSyncExternalStore } from 'react'

const KEY = 'irrx-recent'
const MAX = 12
const EVENT = 'irrx-recent'

export interface RecentEntry {
  /** Path to open, e.g. "/asn/AS3333". */
  path: string
  label: string
  kind: 'prefix' | 'asn' | 'as-set' | 'route-set'
}

let cache: { raw: string | null; list: RecentEntry[] } = { raw: null, list: [] }

function read(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === cache.raw) return cache.list
    const parsed: unknown = raw ? JSON.parse(raw) : []
    const list = Array.isArray(parsed)
      ? parsed.filter(
          (e): e is RecentEntry =>
            typeof e === 'object' &&
            e !== null &&
            typeof (e as RecentEntry).path === 'string' &&
            typeof (e as RecentEntry).label === 'string',
        )
      : []
    cache = { raw, list }
    return list
  } catch {
    return cache.list
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}

const EMPTY: RecentEntry[] = []

/** Recent entries on the client; empty during SSR and hydration. */
export function useRecent(): RecentEntry[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY)
}

export function clearRecent() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Ignore: nothing to clear if storage is unavailable.
  }
  window.dispatchEvent(new Event(EVENT))
}

/** Record a viewed report once it has rendered. */
export function useRecordRecent(entry: RecentEntry | null) {
  const path = entry?.path
  useEffect(() => {
    if (!entry) return
    try {
      const next = [entry, ...read().filter((e) => e.path !== entry.path)].slice(0, MAX)
      localStorage.setItem(KEY, JSON.stringify(next))
      window.dispatchEvent(new Event(EVENT))
    } catch {
      // Storage blocked: history is simply not kept.
    }
    // Only re-run when the page changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])
}
