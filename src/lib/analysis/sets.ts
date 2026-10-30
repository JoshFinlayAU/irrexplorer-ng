// AS-set / route-set expansion. Breadth-first, one IRRd call per level, like
// the original, with the same 1000-set limit. Unlike the original, loops,
// missing sets and truncation are reported instead of silently dropped.

import { parsePrefix } from '../ip'
import { setKey, type SetExpansion, type SetInfo, type SetRow } from './types'

export interface SetLevelResult {
  name: string
  source: string
  members: string[]
}

export type ResolveLevel = (names: string[]) => Promise<SetLevelResult[]>

export const SET_SIZE_LIMIT = 1000
/** Rows are one per distinct path, which can grow quickly in meshed sets. */
export const ROW_LIMIT = 5000

/** Strip a route-set range operator ("^+", "^-", "^24", "^24-32") from a member. */
export function stripRangeOperator(member: string): string {
  return member.replace(/\^(?:[+-]|\d+(?:-\d+)?)$/, '')
}

/** True when a member names a set to expand (not an ASN, not a prefix). */
export function isSetMember(member: string): boolean {
  const m = stripRangeOperator(member).toUpperCase()
  if (/^AS\d+$/.test(m)) return false
  if (parsePrefix(m)) return false
  return m.length > 0
}

export async function expandSet(
  root: string,
  category: 'as-set' | 'route-set',
  resolve: ResolveLevel,
  limit = SET_SIZE_LIMIT,
): Promise<SetExpansion> {
  const resolved = new Map<string, SetLevelResult[]>()
  const queried = new Set<string>()
  root = root.toUpperCase()
  let pending = [root]
  let depthReached = 0
  let truncated = false

  while (pending.length > 0) {
    if (pending.length > limit || resolved.size > limit) {
      truncated = true
      break
    }
    depthReached++
    for (const n of pending) queried.add(n)
    const results = await resolve(pending)
    for (const r of results) {
      const name = r.name.toUpperCase()
      const list = resolved.get(name) ?? []
      list.push({ ...r, name })
      resolved.set(name, list)
    }
    const next = new Set<string>()
    for (const r of results) {
      for (const member of r.members) {
        if (!isSetMember(member)) continue
        const name = stripRangeOperator(member).toUpperCase()
        if (!queried.has(name)) next.add(name)
      }
    }
    pending = [...next].sort()
  }

  const sets: Record<string, SetInfo> = {}
  for (const [name, entries] of resolved) {
    for (const entry of entries) {
      const members = [...new Set(entry.members)].sort()
      const missing = members.filter((m) => {
        if (!isSetMember(m)) return false
        const child = stripRangeOperator(m).toUpperCase()
        return !resolved.has(child) && queried.has(child)
      })
      sets[setKey(name, entry.source)] = { members, missing }
    }
  }

  const rows: SetRow[] = []
  const walk = (name: string, path: string[]) => {
    // Children are the union over every IRR the set exists in, walked once.
    const children = new Set<string>()
    for (const entry of resolved.get(name) ?? []) {
      if (rows.length >= ROW_LIMIT) {
        truncated = true
        return
      }
      const loops: string[] = []
      for (const member of sets[setKey(name, entry.source)]?.members ?? []) {
        if (!isSetMember(member)) continue
        const child = stripRangeOperator(member).toUpperCase()
        if (path.includes(child)) loops.push(member)
        else if (resolved.has(child)) children.add(child)
      }
      rows.push({ name, source: entry.source, depth: path.length, path, loops })
    }
    for (const child of [...children].sort()) walk(child, [...path, child])
  }
  walk(root, [root])

  rows.sort(
    (a, b) => a.depth - b.depth || a.name.localeCompare(b.name) || a.source.localeCompare(b.source),
  )

  return {
    root,
    category,
    rows,
    sets,
    found: resolved.has(root),
    truncated,
    depthReached,
    limit,
    totalSets: resolved.size,
  }
}
