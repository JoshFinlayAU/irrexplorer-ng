import { createFileRoute } from '@tanstack/react-router'
import { parsePrefix } from '~/lib/ip'
import { json, text, toCompatSummary } from '~/server/api/compat'
import { prefixReport } from '~/server/services/prefix'

export const Route = createFileRoute('/api/prefixes/prefix/$')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const raw = decodeURIComponent(params._splat ?? '')
        const prefix = parsePrefix(raw)
        if (!prefix) return text(`Invalid prefix: ${raw}`, 400)
        const report = await prefixReport(prefix.cidr)
        return json(report.overlaps.map(toCompatSummary))
      },
    },
  },
})
