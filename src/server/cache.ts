// Small in-process TTL/LRU cache with in-flight de-duplication. Safe to lose
// on restart: it only ever holds copies of upstream responses.

import { LRUCache } from 'lru-cache'
import { env } from './env'

// Anything except null/undefined, which LRUCache cannot store.
type Value = string | number | boolean | object

// Bounded by total size, not just entry count: one large ASN can cache
// megabytes, and an entry count alone would let many of them exhaust memory.
const store = new LRUCache<string, Value>({
  max: 5000,
  maxSize: env().CACHE_MAX_MB * 1024 * 1024,
  sizeCalculation: (value) => Math.max(1, JSON.stringify(value).length),
})
const inflight = new Map<string, Promise<unknown>>()

export async function cached<T extends Value>(
  key: string,
  load: () => Promise<T>,
  ttlSeconds = env().CACHE_TTL_SECONDS,
): Promise<T> {
  if (ttlSeconds > 0) {
    const hit = store.get(key)
    if (hit !== undefined) return hit as T
  }
  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>

  const promise = load()
    .then((value) => {
      if (ttlSeconds > 0) store.set(key, value, { ttl: ttlSeconds * 1000 })
      return value
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, promise)
  return promise
}

export function clearCache(): void {
  store.clear()
  inflight.clear()
}
