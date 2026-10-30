import { createFileRoute } from '@tanstack/react-router'
import { json } from '~/server/api/compat'
import { healthSnapshot } from '~/server/health'
import { asNames, bgpTable } from '~/server/sources/bgptools'
import { rirStats } from '~/server/sources/rirstats'
import { vrps } from '~/server/sources/rpki'
import { startDatasets } from '~/server/services/status'

const started = new Date().toISOString()

// Liveness and freshness for probes. Never calls an upstream: it reports the
// last success per source as recorded by real traffic and dataset loads.
export const Route = createFileRoute('/healthz')({
  server: {
    handlers: {
      GET: () => {
        startDatasets()
        return json({
          status: 'ok',
          startedAt: started,
          uptimeSeconds: Math.round(process.uptime()),
          upstreams: healthSnapshot(),
          datasets: [bgpTable.status(), asNames.status(), vrps.status(), rirStats.status()],
        })
      },
    },
  },
})
