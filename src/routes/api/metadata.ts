import { createFileRoute } from '@tanstack/react-router'
import { json } from '~/server/api/compat'
import { statusReport } from '~/server/services/status'

export const Route = createFileRoute('/api/metadata')({
  server: {
    handlers: {
      GET: async () => {
        const s = await statusReport()
        const bgp = s.datasets.find((d) => d.name === 'bgp.tools table')
        return json({
          last_update: {
            irr: Object.fromEntries((s.irr ?? []).map((i) => [i.source, i.lastUpdate])),
            importer: bgp?.loadedAt ?? null,
          },
          ng: s,
        })
      },
    },
  },
})
