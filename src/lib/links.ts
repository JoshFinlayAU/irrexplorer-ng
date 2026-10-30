// Turn a classified query into a router location.
import type { Query } from './parse'
import { formatAsn, setType } from './parse'

export type QueryLocation =
  | { to: '/prefix/$'; params: { _splat: string } }
  | { to: '/asn/$asn'; params: { asn: string } }
  | { to: '/as-set/$name'; params: { name: string } }
  | { to: '/route-set/$name'; params: { name: string } }

export function locationFor(q: Exclude<Query, { kind: 'invalid' }>): QueryLocation {
  switch (q.kind) {
    case 'prefix':
      // A host query keeps its bare-IP form in the URL, like the original.
      return {
        to: '/prefix/$',
        params: { _splat: q.isHost ? q.cidr.replace(/\/\d+$/, '') : q.cidr },
      }
    case 'asn':
      return { to: '/asn/$asn', params: { asn: formatAsn(q.asn) } }
    case 'set':
      return setType(q.name) === 'route-set'
        ? { to: '/route-set/$name', params: { name: q.name } }
        : { to: '/as-set/$name', params: { name: q.name } }
  }
}

export function lookingGlassUrl(prefix: string): string {
  return `https://lg.ring.nlnog.net/prefix?q=${encodeURIComponent(prefix)}&match=exact&peer=all`
}
