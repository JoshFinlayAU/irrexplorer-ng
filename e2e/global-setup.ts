// Wait until the bulk datasets have loaded (healthy instance) or failed
// (degraded instance), so tests see a settled state.
interface Health {
  datasets: { name: string; loadedAt: string | null; lastError: string | null }[]
}

async function waitFor(url: string, done: (h: Health) => boolean, label: string) {
  const deadline = Date.now() + 120_000
  for (;;) {
    try {
      const res = await fetch(url)
      if (res.ok && done((await res.json()) as Health)) return
    } catch {
      // Server still starting.
    }
    if (Date.now() > deadline) throw new Error(`${label}: datasets did not settle in time`)
    await new Promise((r) => setTimeout(r, 500))
  }
}

export default async function globalSetup() {
  if (process.env.LIVE_ONLY) return
  await waitFor(
    'http://localhost:3100/healthz',
    (h) => h.datasets.every((d) => d.loadedAt),
    'healthy instance',
  )
  await waitFor(
    'http://localhost:3101/healthz',
    (h) => h.datasets.every((d) => d.lastError),
    'degraded instance',
  )
}
