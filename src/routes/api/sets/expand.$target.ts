import { createFileRoute } from '@tanstack/react-router'
import { parseSetName, setType } from '~/lib/parse'
import { json, text } from '~/server/api/compat'
import { setExpansion } from '~/server/services/sets'
import { setKey } from '~/lib/analysis/types'

export const Route = createFileRoute('/api/sets/expand/$target')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const name = parseSetName(params.target)
        if (!name) return text(`Not a valid set name: ${params.target}`, 400)
        try {
          const e = await setExpansion(name, setType(name))
          return json(
            e.rows.map((r) => {
              const info = e.sets[setKey(r.name, r.source)]
              return {
                name: r.name,
                source: r.source,
                depth: r.depth,
                path: r.path,
                members: info?.members ?? [],
                missing: info?.missing ?? [],
                loops: r.loops,
              }
            }),
          )
        } catch (err) {
          return text(`IRRd unavailable: ${err instanceof Error ? err.message : String(err)}`, 502)
        }
      },
    },
  },
})
