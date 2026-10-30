import { z } from 'zod'

const EnvSchema = z.object({
  IRRD_GRAPHQL_URL: z.url().default('https://rr.ntt.net/graphql/'),
  RPKI_VALIDATOR_URL: z.url().default('http://localhost:8323'),
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
  RPKI_REFRESH_SECONDS: z.coerce.number().int().min(60).default(600),
  RIRSTATS_URL: z
    .url()
    .default('https://ftp.ripe.net/pub/stats/ripencc/nro-stats/latest/nro-delegated-stats'),
  REGISTROBR_URL: z
    .url()
    .default('https://ftp.registro.br/pub/numeracao/origin/nicbr-asn-blk-latest.txt'),
  RIRSTATS_REFRESH_SECONDS: z.coerce.number().int().min(3600).default(86400),
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
