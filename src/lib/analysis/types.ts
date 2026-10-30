// Shapes shared between the server (which builds them) and the UI (which
// renders them). Everything here must be JSON-serialisable.

export type Category = 'danger' | 'warning' | 'info' | 'success'

export const CATEGORY_ORDER: readonly Category[] = ['danger', 'warning', 'info', 'success']

export interface Message {
  category: Category
  text: string
}

/**
 * RPKI route origin validation state (RFC 6811). "unknown" means the RPKI
 * source was unavailable, which is never the same thing as "not-found".
 */
export type RpkiState = 'valid' | 'invalid' | 'not-found' | 'unknown'

/** Why an origin is invalid: no ROA for this ASN, or a ROA whose max length is too short. */
export type RpkiInvalidReason = 'as' | 'length'

export interface RpkiValidity {
  state: RpkiState
  reason?: RpkiInvalidReason
}

export interface Roa {
  asn: number
  maxLength: number
}

export interface IrrRoute {
  asn: number
  rpslPk: string
  rpki: RpkiValidity
}

export interface BgpOrigin {
  asn: number
  rpki: RpkiValidity
}

export type RirName = 'RIPE NCC' | 'ARIN' | 'AFRINIC' | 'LACNIC' | 'APNIC' | 'Registro.BR'

export interface PrefixSummary {
  prefix: string
  rir: RirName | null
  bgpOrigins: BgpOrigin[]
  /** ROAs for this exact prefix. */
  rpkiRoutes: Roa[]
  /** Route objects per IRR source, for this exact prefix. */
  irrRoutes: Record<string, IrrRoute[]>
  messages: Message[]
  categoryOverall: Category
  goodnessOverall: number
}

export type SourceKey = 'irr' | 'bgp' | 'rpki' | 'rir'

export type SourceState =
  | { status: 'ok' }
  | { status: 'degraded'; detail: string }
  | { status: 'unavailable'; detail: string }

export type SourceStates = Record<SourceKey, SourceState>

export interface Notice {
  source: SourceKey | 'ripestat'
  level: 'warning' | 'danger' | 'info'
  text: string
}

export interface SetRow {
  name: string
  source: string
  depth: number
  path: string[]
  members: string[]
  /** Members that are sets but were not found in any IRR. */
  missing: string[]
  /** Members that are sets already on this row's path (a loop). */
  loops: string[]
}

export interface SetExpansion {
  root: string
  category: 'as-set' | 'route-set'
  rows: SetRow[]
  found: boolean
  truncated: boolean
  /** Deepest level reached. */
  depthReached: number
  limit: number
  totalSets: number
}

export interface MemberOf {
  irrsSeen: string[]
  setsPerIrr: Record<string, string[]>
}
