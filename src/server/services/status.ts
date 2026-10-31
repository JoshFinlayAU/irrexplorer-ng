import '@tanstack/react-start/server-only'

import type { DatasetStatus } from '../dataset'
import { healthSnapshot, type SourceHealth, type SourceName } from '../health'
import { asNames, bgpTable } from '../sources/bgptools'
import { databaseStatus } from '../sources/irrd'
import { env } from '../env'
import { geoip, geoipConfigured } from '../sources/geoip'
import { rirStats } from '../sources/rirstats'

export interface StatusReport {
  datasets: DatasetStatus[]
  irr: { source: string; lastUpdate: string | null; authoritative: boolean | null }[] | null
  irrError: string | null
  geoip: { configured: boolean; edition: string }
  health: Record<SourceName, SourceHealth>
}

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err))

export function startDatasets(): void {
  bgpTable.start()
  asNames.start()
  rirStats.start()
  geoip.start()
}

export async function statusReport(): Promise<StatusReport> {
  startDatasets()
  const [irr] = await Promise.allSettled([databaseStatus()])
  return {
    datasets: [bgpTable.status(), asNames.status(), rirStats.status(), geoip.status()],
    geoip: { configured: geoipConfigured(), edition: env().GEOIP_EDITION },
    irr:
      irr.status === 'fulfilled'
        ? irr.value
            .map((s) => ({
              source: s.source,
              lastUpdate: s.lastUpdate ?? null,
              authoritative: s.authoritative ?? null,
            }))
            .sort((a, b) => a.source.localeCompare(b.source))
        : null,
    irrError: irr.status === 'rejected' ? reason(irr.reason) : null,
    health: healthSnapshot(),
  }
}
