import { createFileRoute } from '@tanstack/react-router'
import { parseAsn } from '~/lib/parse'
import { json, text, toCompatSummary } from '~/server/api/compat'
import { asnReport } from '~/server/services/asn'

export const Route = createFileRoute('/api/prefixes/asn/$asn')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const asn = parseAsn(params.asn)
        if (asn === null) return text(`Invalid AS number: ${params.asn}`, 400)
        const report = await asnReport(asn)
        return json({
          directOrigin: report.directOrigin.map(toCompatSummary),
          overlaps: report.overlaps.map(toCompatSummary),
        })
      },
    },
  },
})
