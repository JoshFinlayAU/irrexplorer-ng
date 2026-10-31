// The recorded PeeringDB fixtures (scripts/peeringdb-fixtures.ts) loaded into
// a mirror, for tests that need PeeringDB without a sync.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  applyRows,
  buildPeeringDb,
  PDB_TYPES,
  type PdbTables,
  type PdbType,
  type PeeringDb,
} from '~/server/sources/peeringdb'

const DIR = path.resolve(import.meta.dirname, 'fixtures', 'peeringdb')

export function pdbFixtureRows(type: PdbType): unknown[] {
  return (JSON.parse(readFileSync(path.join(DIR, `${type}.json`), 'utf8')) as { data: unknown[] })
    .data
}

export function peeringdbFixture(): PeeringDb {
  const tables = Object.fromEntries(PDB_TYPES.map((t) => [t, new Map()])) as unknown as PdbTables
  for (const t of PDB_TYPES) applyRows(t, tables[t], pdbFixtureRows(t))
  return buildPeeringDb(tables, 1793448000, 1793448000)
}
