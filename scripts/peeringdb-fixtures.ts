// Cut a full PeeringDB export down to the networks the tests use, keeping the
// exchanges, peering LANs, facilities and organisations they reference. The
// source is a directory of `<type>.json` files as returned by
// `GET https://www.peeringdb.com/api/<type>?depth=0`.
//
// Contacts that PeeringDB only shows to logged-in users keep their role but
// lose their name, email and phone, so the fixtures never carry them.
//
// Usage: node scripts/peeringdb-fixtures.ts <export dir>

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT = path.join(ROOT, 'test', 'fixtures', 'peeringdb')
const SOURCE = process.argv[2]
if (!SOURCE) throw new Error('usage: node scripts/peeringdb-fixtures.ts <export dir>')

// ASNs the e2e and service tests look at, and how many exchange and facility
// rows to keep for each (big networks are trimmed to keep the files small).
const CASES: Record<number, number> = { 3333: Infinity, 1136: Infinity, 15169: 6 }

type Row = Record<string, unknown> & { id: number; status: string }

function load(type: string): Row[] {
  const body = JSON.parse(readFileSync(path.join(SOURCE!, `${type}.json`), 'utf8')) as {
    data: Row[]
  }
  return body.data.filter((r) => r.status === 'ok')
}

const nets = load('net').filter((n) => Number(n.asn) in CASES)
const netIds = new Map(nets.map((n) => [n.id, CASES[Number(n.asn)]!]))

function perNet(rows: Row[]): Row[] {
  const kept = new Map<number, number>()
  return rows
    .filter((r) => netIds.has(Number(r.net_id)))
    .sort((a, b) => a.id - b.id)
    .filter((r) => {
      const n = kept.get(Number(r.net_id)) ?? 0
      kept.set(Number(r.net_id), n + 1)
      return n < netIds.get(Number(r.net_id))!
    })
}

const netixlan = perNet(load('netixlan'))
const netfac = perNet(load('netfac'))
const poc = perNet(load('poc')).map((p) =>
  p.visible === 'Public' ? p : { ...p, name: 'Redacted', email: 'redacted@example.net', phone: '' },
)
const ixIds = new Set(netixlan.map((r) => Number(r.ix_id)))
const ix = load('ix').filter((r) => ixIds.has(r.id))
const ixlan = load('ixlan').filter((r) => ixIds.has(Number(r.ix_id)))
const ixlanIds = new Set(ixlan.map((r) => r.id))
const ixpfx = load('ixpfx').filter((r) => ixlanIds.has(Number(r.ixlan_id)))
const facIds = new Set(netfac.map((r) => Number(r.fac_id)))
const fac = load('fac').filter((r) => facIds.has(r.id))
const orgIds = new Set([...nets, ...ix, ...fac].map((r) => Number(r.org_id)))
const org = load('org').filter((r) => orgIds.has(r.id))

mkdirSync(OUT, { recursive: true })
const tables = { org, net: nets, ix, ixlan, ixpfx, netixlan, fac, netfac, poc }
for (const [type, data] of Object.entries(tables)) {
  writeFileSync(path.join(OUT, `${type}.json`), `${JSON.stringify({ meta: {}, data }, null, 1)}\n`)
  console.log(`${type}: ${data.length}`)
}
