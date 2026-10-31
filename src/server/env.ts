import { z } from 'zod'

const EnvSchema = z.object({
  IRRD_GRAPHQL_URL: z.url().default('https://rr.ntt.net/graphql/'),
  RIPESTAT_URL: z.url().default('https://stat.ripe.net'),
  RIPESTAT_SOURCEAPP: z.string().min(1).default('irrexplorer-ng'),
  BGPTOOLS_URL: z.url().default('https://bgp.tools'),
  BGPTOOLS_USER_AGENT: z.string().default(''),
  /** bgp.tools asks for no more than one dump download every 30 minutes. */
  BGPTOOLS_REFRESH_SECONDS: z.coerce.number().int().min(1800).default(7200),
  /** Set to "false" to skip the dump entirely (tests, offline dev). */
  BGPTOOLS_MIN_HITS: z.coerce.number().int().min(0).default(20),
  BGPTOOLS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  RIRSTATS_URL: z
    .url()
    .default('https://ftp.ripe.net/pub/stats/ripencc/nro-stats/latest/nro-delegated-stats'),
  REGISTROBR_URL: z
    .url()
    .default('https://ftp.registro.br/pub/numeracao/origin/nicbr-asn-blk-latest.txt'),
  RIRSTATS_REFRESH_SECONDS: z.coerce.number().int().min(3600).default(86400),
  /** MaxMind account and licence key for GeoLite2. GeoIP is off without both. */
  MAXMIND_ACCOUNT_ID: z.string().default(''),
  MAXMIND_LICENSE_KEY: z.string().default(''),
  MAXMIND_DOWNLOAD_URL: z.url().default('https://download.maxmind.com'),
  /** GeoLite2-City (country, city, coordinates) or GeoLite2-Country. */
  GEOIP_EDITION: z.enum(['GeoLite2-City', 'GeoLite2-Country']).default('GeoLite2-City'),
  /** How often to check for a new release. Checks are HEAD requests and free. */
  GEOIP_REFRESH_SECONDS: z.coerce.number().int().min(3600).default(21600),
  /** PeeringDB, mirrored in memory. The API key raises the rate limit and is optional. */
  PEERINGDB_URL: z.url().default('https://www.peeringdb.com'),
  PEERINGDB_API_KEY: z.string().default(''),
  PEERINGDB_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Changes are fetched this often; PeeringDB suggests syncing between hourly and daily. */
  PEERINGDB_REFRESH_SECONDS: z.coerce.number().int().min(900).default(3600),
  /** A full download replaces the incremental copy this often, to drop anything missed. */
  PEERINGDB_FULL_SYNC_SECONDS: z.coerce.number().int().min(3600).default(86400),
  /** Pause between requests during a sync; PeeringDB asks for at least two seconds. */
  PEERINGDB_REQUEST_GAP_MS: z.coerce.number().int().min(0).default(2500),
  /** Queries shorter than these lengths are refused as too large, like the original. */
  MIN_PREFIX_LENGTH_V4: z.coerce.number().int().min(0).max(32).default(9),
  MIN_PREFIX_LENGTH_V6: z.coerce.number().int().min(0).max(128).default(29),
  /** Optional directory for raw bulk downloads, reused across restarts. */
  BULK_CACHE_DIR: z.string().optional(),
  /** Set to "false" to skip all bulk dataset downloads (tests, offline dev). */
  BULK_DATASETS_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  PORT: z.coerce.number().int().positive().default(3000),
  CACHE_TTL_SECONDS: z.coerce.number().int().min(0).default(600),
  /** Upper bound for the in-process response cache. */
  CACHE_MAX_MB: z.coerce.number().int().min(1).default(256),
  /** Most concurrent calls to each per-request upstream, to be a polite client. */
  IRRD_MAX_CONCURRENCY: z.coerce.number().int().min(1).default(12),
  RIPESTAT_MAX_CONCURRENCY: z.coerce.number().int().min(1).default(8),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(500).default(8000),
  /** Batched IRRd overlap lookups on ASN pages can legitimately take longer. */
  IRRD_BULK_TIMEOUT_MS: z.coerce.number().int().min(1000).default(60000),
  /** Stop set expansion beyond this many sets (the original used 1000). */
  SET_SIZE_LIMIT: z.coerce.number().int().min(1).max(100000).default(1000),
})

export type Env = z.infer<typeof EnvSchema>

let cached: Env | undefined

export function env(): Env {
  cached ??= EnvSchema.parse(process.env)
  return cached
}

/** Tests only: re-read process.env on next access. */
export function resetEnv(): void {
  cached = undefined
}
