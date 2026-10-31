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
  /** GeoLite2 location; absent when not looked up, null when GeoIP is unavailable. */
  geo?: PrefixGeo | null
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

/** One row per (set, IRR source, path), like the original. */
export interface SetRow {
  name: string
  source: string
  depth: number
  path: string[]
  /** Members that are sets already on this row's path (a loop). */
  loops: string[]
}

/** Per (set, source) data, shared by every row for that set so it is sent once. */
export interface SetInfo {
  members: string[]
  /** Members that are sets but were not found in any IRR. */
  missing: string[]
}

export const setKey = (name: string, source: string) => `${name}|${source}`

export interface SetExpansion {
  root: string
  category: 'as-set' | 'route-set'
  rows: SetRow[]
  /** Keyed by setKey(name, source). */
  sets: Record<string, SetInfo>
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

/** Share of a prefix's addresses that GeoLite2 places in one country. */
export interface GeoCountry {
  /** ISO 3166-1 alpha-2. */
  code: string
  name: string
  /** 0..1 of the prefix's addresses. */
  share: number
}

/** City-level detail, only given where one GeoLite2 network covers the query. */
export interface GeoPlace {
  city: string | null
  region: string | null
  country: string | null
  countryName: string | null
  /** Country the block is registered to, which can differ from where it is used. */
  registered: string | null
  registeredName: string | null
  latitude: number | null
  longitude: number | null
  radiusKm: number | null
}

/** Whether GeoIP could be used: "unconfigured" means no MaxMind licence key. */
export type GeoAvailability = 'ok' | 'unconfigured' | 'unavailable'

/** Country shares across several prefixes (an ASN's announcements). */
export interface GeoBreakdown {
  countries: GeoCountry[]
  other: number
  unknown: number
}

export interface PrefixGeo {
  /** Most addresses first; the tail beyond a few countries is folded into "other". */
  countries: GeoCountry[]
  /** Share in countries not listed. */
  other: number
  /** Share with no country in GeoLite2. */
  unknown: number
  /** GeoLite2 networks the prefix spans (a lower bound when estimated). */
  networks: number
  /** True when the prefix spans too many networks and was sampled instead. */
  estimated: boolean
  place: GeoPlace | null
}

/** Whether PeeringDB could be used: "disabled" means PEERINGDB_ENABLED=false. */
export type PdbAvailability = 'ok' | 'unavailable' | 'disabled'

export interface PdbContact {
  role: string
  name: string
  email: string
  phone: string
  url: string
}

/** One port of a network on an exchange's peering LAN. */
export interface PdbIxConnection {
  ixId: number
  ix: string
  city: string
  country: string
  /** Mbit/s, as PeeringDB stores it. */
  speed: number
  ipv4: string | null
  ipv6: string | null
  routeServer: boolean
  bfd: boolean
  operational: boolean
}

export interface PdbFacility {
  facId: number
  name: string
  city: string
  country: string
  /** ASN used at the facility, when it differs from the network's own. */
  localAsn: number | null
}

export interface PdbNetwork {
  id: number
  asn: number
  name: string
  aka: string
  nameLong: string
  website: string
  org: { id: number; name: string; website: string; city: string; country: string } | null
  types: string[]
  scope: string
  traffic: string
  ratio: string
  /** Prefix counts the network asks peers to allow, used for max-prefix limits. */
  prefixes4: number | null
  prefixes6: number | null
  unicast: boolean
  multicast: boolean
  ipv6: boolean
  neverViaRouteServers: boolean
  /** As written in PeeringDB, for example "RIPE::AS-FOO AS-BAR". */
  irrAsSet: string
  lookingGlass: string
  routeServer: string
  statusDashboard: string
  policy: { general: string; url: string; locations: string; ratio: boolean; contracts: string }
  notes: string
  created: string
  updated: string
  contacts: PdbContact[]
  exchanges: PdbIxConnection[]
  facilities: PdbFacility[]
}

/** A network named in PeeringDB, for "listed by" and port lookups. */
export interface PdbNetRef {
  id: number
  asn: number
  name: string
}

/** An exchange peering LAN that overlaps a queried prefix. */
export interface PdbIxLan {
  ixId: number
  ix: string
  city: string
  country: string
  prefix: string
  /** PeeringDB's flag for whether the LAN is meant to be announced in the DFZ. */
  inDfz: boolean
}

/** The network whose exchange port uses a queried address. */
export interface PdbIxPort extends PdbIxConnection {
  net: PdbNetRef
}

export interface PdbPrefixInfo {
  lans: PdbIxLan[]
  ports: PdbIxPort[]
}
