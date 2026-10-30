import { createFileRoute } from '@tanstack/react-router'
import { json, text } from '~/server/api/compat'
import { memberOfReport } from '~/server/services/sets'

export const Route = createFileRoute('/api/sets/member-of/$objectClass/$target')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const cls = params.objectClass
        if (cls !== 'as-set' && cls !== 'route-set')
          return text(`Unknown object class: ${cls}`, 404)
        try {
          return json(await memberOfReport(params.target, cls))
        } catch (err) {
          return text(`IRRd unavailable: ${err instanceof Error ? err.message : String(err)}`, 502)
        }
      },
    },
  },
})
