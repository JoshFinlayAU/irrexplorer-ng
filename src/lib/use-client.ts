import { useSyncExternalStore } from 'react'

const noopSubscribe = () => () => undefined

/** False during SSR and hydration, true afterwards. Avoids hydration mismatches. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )
}

function subscribeMinute(callback: () => void) {
  const id = setInterval(callback, 60_000)
  return () => clearInterval(id)
}

/** Current time rounded to the minute on the client; null on the server. */
export function useNowMinute(): number | null {
  return useSyncExternalStore(
    subscribeMinute,
    () => Math.floor(Date.now() / 60_000) * 60_000,
    () => null,
  )
}
