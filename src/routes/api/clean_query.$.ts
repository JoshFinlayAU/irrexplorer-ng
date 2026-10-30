import { createFileRoute } from '@tanstack/react-router'
import { cleanQuery, json, text } from '~/server/api/compat'

export const Route = createFileRoute('/api/clean_query/$')({
  server: {
    handlers: {
      GET: ({ params }) => {
        const result = cleanQuery(decodeURIComponent(params._splat ?? ''))
        return 'error' in result ? text(result.error, 400) : json(result)
      },
    },
  },
})
