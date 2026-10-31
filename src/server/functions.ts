// Server functions: the only way the browser reaches upstream data.
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { asnReport } from './services/asn'
import { prefixReport } from './services/prefix'
import { memberOfReport, setExpansion, setListedBy } from './services/sets'
import { statusReport } from './services/status'
import { objectText } from './sources/irrd'

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err))

export const fetchPrefixReport = createServerFn({ method: 'GET' })
  .validator(z.object({ prefix: z.string().min(1).max(64) }))
  .handler(({ data }) => prefixReport(data.prefix))

export const fetchAsnReport = createServerFn({ method: 'GET' })
  .validator(z.object({ asn: z.number().int().min(0).max(4294967295) }))
  .handler(({ data }) => asnReport(data.asn))

const SetClass = z.enum(['as-set', 'route-set'])

export const fetchSetExpansion = createServerFn({ method: 'GET' })
  .validator(z.object({ name: z.string().min(1).max(256), category: SetClass }))
  .handler(async ({ data }) => {
    // AS-sets are named in PeeringDB by networks that use them as their filter source.
    const listedBy = data.category === 'as-set' ? setListedBy(data.name) : null
    try {
      return {
        ok: true as const,
        expansion: await setExpansion(data.name, data.category),
        listedBy,
      }
    } catch (err) {
      return { ok: false as const, error: reason(err), listedBy }
    }
  })

export const fetchMemberOf = createServerFn({ method: 'GET' })
  .validator(z.object({ target: z.string().min(1).max(256), objectClass: SetClass }))
  .handler(async ({ data }) => {
    try {
      return { ok: true as const, memberOf: await memberOfReport(data.target, data.objectClass) }
    } catch (err) {
      return { ok: false as const, error: reason(err) }
    }
  })

export const fetchRpslObject = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      rpslPk: z.string().min(1).max(128),
      source: z.string().min(1).max(64),
      objectClass: z.enum(['route', 'route6']),
    }),
  )
  .handler(async ({ data }) => {
    try {
      return {
        ok: true as const,
        text: await objectText(data.rpslPk, data.source, data.objectClass),
      }
    } catch (err) {
      return { ok: false as const, error: reason(err) }
    }
  })

export const fetchStatus = createServerFn({ method: 'GET' }).handler(() => statusReport())
