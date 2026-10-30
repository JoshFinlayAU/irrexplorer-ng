import { createFileRoute } from '@tanstack/react-router'
import { parseSetName, setType } from '~/lib/parse'
import { json, text } from '~/server/api/compat'
import { setExpansion } from '~/server/services/sets'

export const Route = createFileRoute('/api/sets/expand/$target')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const name = parseSetName(params.target)
        if (!name) return text(`Not a valid set name: ${params.target}`, 400)
        try {
          const e = await setExpansion(name, setType(name))
          return json(
            e.rows.map((r) => ({
              name: r.name,
              source: r.source,
              depth: r.depth,
              path: r.path,
              members: r.members,
              missing: r.missing,
              loops: r.loops,
            })),
          )
        } catch (err) {
          return text(`IRRd unavailable: ${err instanceof Error ? err.message : String(err)}`, 502)
        }
      },
    },
  },
})
