// After a record run (pnpm fixtures:record), cut the bulk dumps down to the
// rows the recorded cases can ever touch, so replay gives the same results
// with small fixture files. A row is kept when its prefix overlaps any prefix
// seen in the recorded IRRd/RIPEstat traffic or the case list, or when its
// ASN is one of the case ASNs.
//
// Usage: node scripts/trim-fixtures.ts [bulk source dir, default .cache]

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { makePrefix, parseIp, parsePrefixParts, type PrefixParts } from '../src/lib/ip.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const FIXTURES = path.join(ROOT, 'test', 'fixtures')
const SOURCE = path.resolve(process.argv[2] ?? path.join(ROOT, '.cache'))
const RPKI_URL = process.env.REAL_RPKI_VALIDATOR_URL ?? 'http://localhost:8323'

// ASNs whose whole footprint the e2e cases rely on.
const CASE_ASNS = [3333, 1136]

const keyOf = (v: number, len: number, net: bigint) => `${v}:${len}:${net.toString(16)}`
const covering = new Set<string>() // every interesting prefix
const coveredBy = new Set<string>() // every shorter mask of an interesting prefix
let interestingCount = 0

function addInteresting(text: string) {
  const p = parsePrefixParts(text)
  if (!p) return
  const k = keyOf(p.version, p.length, p.network)
  if (covering.has(k)) return
  covering.add(k)
  interestingCount++
  for (let len = 0; len <= p.length; len++) {
    coveredBy.add(keyOf(p.version, len, makePrefix(p.version, p.network, len).network))
  }
}

function overlaps(p: PrefixParts): boolean {
  if (coveredBy.has(keyOf(p.version, p.length, p.network))) return true // p covers something interesting
  for (let len = 0; len <= p.length; len++) {
    if (covering.has(keyOf(p.version, len, makePrefix(p.version, p.network, len).network)))
      return true
  }
  return false
}

// Collect every prefix-looking string from recorded exchanges.
const PREFIX_RE = /[0-9a-fA-F:.]+\/\d{1,3}/g
function harvest(dir: string) {
  if (!existsSync(dir)) return
  for (const f of readdirSync(dir)) {
    const text = readFileSync(path.join(dir, f), 'utf8')
    for (const m of text.matchAll(PREFIX_RE)) addInteresting(m[0])
  }
}
harvest(path.join(FIXTURES, 'irrd'))
harvest(path.join(FIXTURES, 'ripestat'))
for (const p of [
  '193.0.0.0/21',
  '193.0.0.1/32',
  '2001:67c:2e8::/48',
  '8.8.8.0/24',
  '8.0.0.0/9',
  '8.0.0.0/12',
  '10.10.0.0/16',
  '137.17.80.0/24',
  '1.1.1.0/24',
]) {
  addInteresting(p)
}

const tableLines = readFileSync(path.join(SOURCE, 'bgptools-table.txt'), 'utf8').split('\n')
const vrpText = await (await fetch(`${RPKI_URL}/csv`)).text()
const vrpLines = vrpText.split('\n')

// Everything the case ASNs originate is interesting too.
for (const line of tableLines) {
  if (!line) continue
  const row = JSON.parse(line) as { CIDR: string; ASN: number }
  if (CASE_ASNS.includes(row.ASN)) addInteresting(row.CIDR)
}
for (const line of vrpLines.slice(1)) {
  const [asn, prefix] = line.split(',')
  if (asn && prefix && CASE_ASNS.includes(Number(asn.replace('AS', '')))) addInteresting(prefix)
}
console.log(`interesting prefixes: ${interestingCount}`)

const asnsSeen = new Set<number>(CASE_ASNS)

const keptTable = tableLines.filter((line) => {
  if (!line) return false
  const row = JSON.parse(line) as { CIDR: string; ASN: number }
  const p = parsePrefixParts(row.CIDR)
  const keep = !!p && (CASE_ASNS.includes(row.ASN) || overlaps(p))
  if (keep) asnsSeen.add(row.ASN)
  return keep
})

const keptVrps = [vrpLines[0] ?? 'ASN,IP Prefix,Max Length,Trust Anchor'].concat(
  vrpLines.slice(1).filter((line) => {
    const [asn, prefix] = line.split(',')
    const p = prefix ? parsePrefixParts(prefix) : null
    const n = Number((asn ?? '').replace('AS', ''))
    const keep = !!p && (CASE_ASNS.includes(n) || overlaps(p))
    if (keep) asnsSeen.add(n)
    return keep
  }),
)

const asnLines = readFileSync(path.join(SOURCE, 'bgptools-asns.txt'), 'utf8').split('\n')
const keptAsns = asnLines.filter(
  (line, i) => i === 0 || asnsSeen.has(Number(/^AS(\d+),/.exec(line)?.[1] ?? -1)),
)

const nroLines = readFileSync(path.join(SOURCE, 'nro-delegated.txt'), 'utf8').split('\n')
const keptNro = nroLines.filter((line) => {
  const f = line.split('|')
  if (f[2] === 'ipv6') {
    const p = parsePrefixParts(`${f[3]}/${f[4]}`)
    return !!p && overlaps(p)
  }
  if (f[2] === 'ipv4' && /^\d+$/.test(f[4] ?? '')) {
    const ip = parseIp(f[3] ?? '')
    if (!ip) return false
    // Approximate the range by its covering block for the overlap test.
    const size = BigInt(f[4]!)
    let len = 32
    while (len > 0 && 1n << BigInt(32 - len) < size) len--
    return overlaps(makePrefix(4, ip.value, len))
  }
  return false
})

const brLines = readFileSync(path.join(SOURCE, 'registrobr.txt'), 'utf8').split('\n')
const keptBr = brLines.filter((line) =>
  line
    .split('|')
    .slice(3)
    .some((f) => {
      const p = f.includes('/') ? parsePrefixParts(f) : null
      return !!p && overlaps(p)
    }),
)

function write(rel: string, lines: string[]) {
  const file = path.join(FIXTURES, rel)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${lines.join('\n')}\n`)
  console.log(`${rel}: ${lines.length} lines`)
}
write('bgptools/table.jsonl', keptTable)
write('bgptools/asns.csv', keptAsns)
write('rpki/vrps.csv', keptVrps)
write('rirstats/nro-delegated-stats.txt', keptNro)
write('rirstats/registrobr.txt', keptBr)
