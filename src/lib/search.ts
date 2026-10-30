// URL search params shared by the prefix and ASN views, so display options,
// filters, sort order and hidden columns survive in shareable links.
import { z } from 'zod'

export const reportSearchSchema = z.object({
  reduced: z.boolean().optional().catch(undefined),
  issues: z.boolean().optional().catch(undefined),
  filter: z.string().max(100).optional().catch(undefined),
  sort: z.string().max(40).optional().catch(undefined),
  sort2: z.string().max(40).optional().catch(undefined),
  hide: z.array(z.string().max(40)).max(40).optional().catch(undefined),
})

export type ReportSearch = z.infer<typeof reportSearchSchema>

/** Drop default values so URLs stay short. */
export function cleanSearch(s: ReportSearch): ReportSearch {
  return {
    reduced: s.reduced || undefined,
    issues: s.issues || undefined,
    filter: s.filter ? s.filter : undefined,
    sort: s.sort,
    sort2: s.sort2,
    hide: s.hide && s.hide.length > 0 ? s.hide : undefined,
  }
}

export const setSearchSchema = z.object({
  sort: z.string().max(40).optional().catch(undefined),
  filter: z.string().max(100).optional().catch(undefined),
  problems: z.boolean().optional().catch(undefined),
})

export type SetSearch = z.infer<typeof setSearchSchema>
