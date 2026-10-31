import '@tanstack/react-start/server-only'

import { expandSet } from '~/lib/analysis/sets'
import type { MemberOf, PdbNetRef, SetExpansion } from '~/lib/analysis/types'
import { env } from '../env'
import { memberOf, setLevel } from '../sources/irrd'
import { pdbSetUsers } from '../sources/peeringdb'

export async function setExpansion(
  name: string,
  category: 'as-set' | 'route-set',
): Promise<SetExpansion> {
  return expandSet(name, category, setLevel, env().SET_SIZE_LIMIT)
}

export async function memberOfReport(
  target: string,
  objectClass: 'as-set' | 'route-set',
): Promise<MemberOf> {
  const rows = await memberOf(target, objectClass)
  const setsPerIrr: Record<string, string[]> = {}
  for (const r of rows) (setsPerIrr[r.source] ??= []).push(r.name)
  for (const list of Object.values(setsPerIrr)) list.sort()
  return { irrsSeen: Object.keys(setsPerIrr).sort(), setsPerIrr }
}

/** Networks that list this AS-set in PeeringDB, or null when PeeringDB is not loaded. */
export function setListedBy(name: string): PdbNetRef[] | null {
  return pdbSetUsers(name)
}
