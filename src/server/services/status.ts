import '@tanstack/react-start/server-only'

import type { DatasetStatus } from '../dataset'
import { healthSnapshot, type SourceHealth, type SourceName } from '../health'
import { asNames, bgpTable } from '../sources/bgptools'
import { databaseStatus } from '../sources/irrd'
import { rirStats } from '../sources/rirstats'
import { validatorStatus, vrps } from '../sources/rpki'

export interface StatusReport {
  datasets: DatasetStatus[]
  irr: { source: string; lastUpdate: string | null; authoritative: boolean | null }[] | null
  irrError: string | null
  validator: { version: string | null; lastUpdateDone: string | null } | null
  validatorError: string | null
  health: Record<SourceName, SourceHealth>
}

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err))

export function startDatasets(): void {
  bgpTable.start()
  asNames.start()
  vrps.start()
  rirStats.start()
}

export async function statusReport(): Promise<StatusReport> {
  startDatasets()
  const [irr, validator] = await Promise.allSettled([databaseStatus(), validatorStatus()])
  return {
    datasets: [bgpTable.status(), asNames.status(), vrps.status(), rirStats.status()],
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
    validator:
      validator.status === 'fulfilled'
        ? {
            version: validator.value.version ?? null,
            lastUpdateDone: validator.value.lastUpdateDone ?? null,
          }
        : null,
    validatorError: validator.status === 'rejected' ? reason(validator.reason) : null,
    health: healthSnapshot(),
  }
}
