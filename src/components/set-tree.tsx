// AS-set / route-set expansion as a real tree. Each node is a set; its direct
// ASN and prefix members are counted and listed on demand. Loops, member sets
// that do not exist and sets past the expansion limit are marked in place.
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { setKey, type SetExpansion } from '~/lib/analysis/types'
import { isSetMember, stripRangeOperator } from '~/lib/analysis/sets'
import { MemberLink } from './set-tables'

interface Model {
  sourcesOf: Map<string, string[]>
  /** Direct set children and leaf members per set, merged over its IRRs. */
  children: Map<string, string[]>
  leaves: Map<string, string[]>
  missing: Set<string>
}

function buildModel(e: SetExpansion): Model {
  const sourcesOf = new Map<string, string[]>()
  const children = new Map<string, Set<string>>()
  const leaves = new Map<string, Set<string>>()
  const missing = new Set<string>()
  for (const [key, info] of Object.entries(e.sets)) {
    const cut = key.lastIndexOf('|')
    const name = key.slice(0, cut)
    sourcesOf.set(name, [...(sourcesOf.get(name) ?? []), key.slice(cut + 1)])
    const c = children.get(name) ?? new Set<string>()
    const l = leaves.get(name) ?? new Set<string>()
    for (const m of info.members) {
      if (isSetMember(m)) c.add(stripRangeOperator(m).toUpperCase())
      else l.add(m)
    }
    for (const m of info.missing) missing.add(stripRangeOperator(m).toUpperCase())
    children.set(name, c)
    leaves.set(name, l)
  }
  const sorted = (m: Map<string, Set<string>>) =>
    new Map([...m].map(([k, v]) => [k, [...v].sort()] as const))
  return { sourcesOf, children: sorted(children), leaves: sorted(leaves), missing }
}

/** Names on any path from the root to a set matching the predicate. */
function pathNames(e: SetExpansion, match: (name: string, source: string) => boolean) {
  const out = new Set<string>()
  for (const r of e.rows) if (match(r.name, r.source)) for (const n of r.path) out.add(n)
  return out
}

function SetLink({ name, category }: { name: string; category: 'as-set' | 'route-set' }) {
  return category === 'route-set' ? (
    <Link to="/route-set/$name" params={{ name }} className="no-underline hover:underline">
      {name}
    </Link>
  ) : (
    <Link to="/as-set/$name" params={{ name }} className="no-underline hover:underline">
      {name}
    </Link>
  )
}

const LEAVES_SHOWN = 60

function Leaves({ list }: { list: string[] }) {
  const [all, setAll] = useState(false)
  const shown = all ? list : list.slice(0, LEAVES_SHOWN)
  return (
    <div className="my-1 ml-6 flex flex-wrap gap-x-3 gap-y-0.5 border-l border-dotted border-[var(--rule-strong)] pl-3 text-[0.75rem]">
      {shown.map((m) => (
        <MemberLink key={m} member={m} />
      ))}
      {list.length > LEAVES_SHOWN ? (
        <button
          type="button"
          onClick={() => setAll(!all)}
          className="label hover:text-[var(--text)]"
        >
          {all ? 'fewer' : `+${list.length - LEAVES_SHOWN} more`}
        </button>
      ) : null}
    </div>
  )
}

function Marker({ kind }: { kind: 'loop' | 'missing' | 'cut' }) {
  const text = { loop: 'loop', missing: 'not found', cut: 'not expanded' }[kind]
  const cls = {
    loop: 'bg-[var(--danger-tint)] text-[var(--danger-fg)]',
    missing: 'bg-[var(--warning-tint)] text-[var(--warning-fg)]',
    cut: 'border border-dashed border-[var(--rule-strong)] text-[var(--muted)]',
  }[kind]
  return <span className={`px-1 font-mono text-[0.68rem] uppercase ${cls}`}>{text}</span>
}

function Node({
  name,
  path,
  model,
  category,
  focus,
  needle,
  expanded,
  toggle,
}: {
  name: string
  path: string[]
  model: Model
  category: 'as-set' | 'route-set'
  focus: Set<string> | null
  needle: string
  expanded: Map<string, boolean>
  toggle: (key: string, open: boolean) => void
}) {
  const key = path.join('>')
  const sources = model.sourcesOf.get(name) ?? []
  const kids = model.children.get(name) ?? []
  const leaves = model.leaves.get(name) ?? []
  const asns = leaves.filter((m) => /^AS\d+$/i.test(m)).length
  const depth = path.length - 1
  const defaultOpen = focus ? focus.has(name) : depth < 2
  const open = expanded.get(key) ?? defaultOpen
  const hit = needle !== '' && name.includes(needle)
  const visibleKids = focus
    ? kids.filter((k) => focus.has(k) || path.includes(k) || model.missing.has(k))
    : kids

  return (
    <li className="relative">
      <div
        className={`flex flex-wrap items-baseline gap-x-2 py-0.5 ${hit ? 'bg-[var(--hl)]' : ''}`}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${name}`}
          onClick={() => toggle(key, !open)}
          className="w-4 shrink-0 text-center font-mono text-[var(--muted)] hover:text-[var(--text)]"
        >
          {open ? '−' : '+'}
        </button>
        <span className="font-mono text-[0.85rem] font-medium">
          <SetLink name={name} category={category} />
        </span>
        {sources.map((s) => (
          <span key={s} className="font-mono text-[0.68rem] text-[var(--muted)]">
            {s}
          </span>
        ))}
        <span className="font-mono text-[0.7rem] text-[var(--faint)]">
          {kids.length} sets / {asns} asn / {leaves.length - asns} pfx / depth {depth}
        </span>
      </div>
      {open ? (
        <>
          {leaves.length > 0 ? <Leaves list={leaves} /> : null}
          {visibleKids.length > 0 ? (
            <ul className="ml-[0.45rem] border-l border-[var(--rule-strong)] pl-3">
              {visibleKids.map((k) =>
                path.includes(k) ? (
                  <li key={k} className="flex items-baseline gap-2 py-0.5 font-mono text-[0.85rem]">
                    <span className="w-4" />
                    <SetLink name={k} category={category} /> <Marker kind="loop" />
                    <span className="text-[0.7rem] text-[var(--faint)]">
                      back to {path.slice(path.indexOf(k)).join(' > ')}
                    </span>
                  </li>
                ) : model.sourcesOf.has(k) ? (
                  <Node
                    key={k}
                    name={k}
                    path={[...path, k]}
                    model={model}
                    category={category}
                    focus={focus}
                    needle={needle}
                    expanded={expanded}
                    toggle={toggle}
                  />
                ) : (
                  <li key={k} className="flex items-baseline gap-2 py-0.5 font-mono text-[0.85rem]">
                    <span className="w-4" />
                    <span>{k}</span>
                    <Marker kind={model.missing.has(k) ? 'missing' : 'cut'} />
                  </li>
                ),
              )}
            </ul>
          ) : null}
        </>
      ) : null}
    </li>
  )
}

export function SetTree({
  expansion,
  filter,
  problems,
}: {
  expansion: SetExpansion
  filter: string
  problems: boolean
}) {
  const model = useMemo(() => buildModel(expansion), [expansion])
  const [expanded, setExpanded] = useState(() => new Map<string, boolean>())
  const needle = filter.trim().toUpperCase()

  const focus = useMemo(() => {
    if (problems) {
      return pathNames(
        expansion,
        (n, s) =>
          (expansion.sets[setKey(n, s)]?.missing.length ?? 0) > 0 ||
          expansion.rows.some((r) => r.name === n && r.loops.length > 0),
      )
    }
    if (!needle) return null
    return pathNames(
      expansion,
      (n, s) =>
        n.includes(needle) ||
        (expansion.sets[setKey(n, s)]?.members ?? []).some((m) => m.toUpperCase().includes(needle)),
    )
  }, [expansion, problems, needle])

  // Changing the filter resets manual expand/collapse so matches show.
  const [lastFocus, setLastFocus] = useState(focus)
  if (lastFocus !== focus) {
    setLastFocus(focus)
    setExpanded(new Map())
  }

  if (focus && focus.size === 0) {
    return (
      <p className="border border-dashed border-[var(--rule-strong)] px-3 py-6 text-center font-mono text-[0.8rem] text-[var(--muted)]">
        {problems ? 'No loops or missing member sets.' : 'No sets match the current filter.'}
      </p>
    )
  }
  return (
    <ul
      aria-label={`Expansion tree of ${expansion.root}`}
      className="border border-[var(--rule)] bg-[var(--panel)] px-3 py-2"
    >
      <Node
        name={expansion.root}
        path={[expansion.root]}
        model={model}
        category={expansion.category}
        focus={focus}
        needle={needle}
        expanded={expanded}
        toggle={(key, open) => setExpanded((m) => new Map(m).set(key, open))}
      />
    </ul>
  )
}

/** Every ASN and prefix reachable from the root, as a flat list to copy. */
export function flatten(expansion: SetExpansion): { asns: string[]; prefixes: string[] } {
  const asns = new Set<string>()
  const prefixes = new Set<string>()
  for (const info of Object.values(expansion.sets)) {
    for (const m of info.members) {
      if (isSetMember(m)) continue
      if (/^AS\d+$/i.test(m)) asns.add(m.toUpperCase())
      else prefixes.add(m)
    }
  }
  return {
    asns: [...asns].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2))),
    prefixes: [...prefixes].sort(),
  }
}
