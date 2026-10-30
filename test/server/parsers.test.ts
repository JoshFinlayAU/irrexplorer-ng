import { describe, expect, it } from 'vitest'
import { fixtureText } from '../recorded'
import { parseTableLine, splitCsvLine } from '~/server/sources/bgptools'
import { parseVrpLine } from '~/server/sources/rpki'
import { parseDelegatedLine, parseRegistroBrLine, rangeToCidrs } from '~/server/sources/rirstats'
import { parseIp } from '~/lib/ip'

describe('bgp.tools table lines', () => {
  it('parses and filters like the original importer', () => {
    expect(parseTableLine('{"CIDR":"193.0.0.0/21","ASN":3333,"Hits":2000}', 20)).toMatchObject({
      asn: 3333,
    })
    expect(parseTableLine('{"CIDR":"193.0.0.0/21","ASN":3333,"Hits":5}', 20)).toBeNull()
    expect(parseTableLine('{"CIDR":"193.0.0.0/29","ASN":3333,"Hits":2000}', 20)).toBeNull()
    expect(parseTableLine('{"CIDR":"2001:db8::/124","ASN":1,"Hits":2000}', 20)).toBeNull()
    expect(parseTableLine('{"CIDR":"nope","ASN":1,"Hits":2000}', 20)).toBeNull()
    expect(parseTableLine('{"CIDR":"1.0.0.0/24","ASN":"1","Hits":2000}', 20)).toBeNull()
    expect(parseTableLine('not json', 20)).toBeNull()
    expect(parseTableLine('', 20)).toBeNull()
  })
  it('parses the recorded fixture', () => {
    const rows = fixtureText('bgptools/table.jsonl')
      .split('\n')
      .map((l) => parseTableLine(l, 20))
      .filter(Boolean)
    expect(rows.length).toBeGreaterThan(100)
  })
  it('splits quoted CSV fields', () => {
    expect(splitCsvLine('AS1,"Foo, Inc ""X""",Unknown,US')).toEqual([
      'AS1',
      'Foo, Inc "X"',
      'Unknown',
      'US',
    ])
  })
})

describe('Routinator VRP lines', () => {
  it('parses and validates', () => {
    expect(parseVrpLine('AS3333,193.0.0.0/21,21,ripe')?.value).toBe(3333 * 256 + 21)
    expect(parseVrpLine('ASN,IP Prefix,Max Length,Trust Anchor')).toBeNull()
    expect(parseVrpLine('AS3333,193.0.0.0/21,20,ripe')).toBeNull()
    expect(parseVrpLine('AS3333,193.0.0.0/21,33,ripe')).toBeNull()
  })
  it('parses the recorded fixture', () => {
    const rows = fixtureText('rpki/vrps.csv').split('\n').map(parseVrpLine).filter(Boolean)
    expect(rows.length).toBeGreaterThan(100)
  })
})

describe('RIR delegated stats', () => {
  it('splits IPv4 ranges into CIDRs', () => {
    const start = parseIp('192.0.2.0')!.value
    expect(rangeToCidrs(start, 256n).map((p) => p.cidr)).toEqual(['192.0.2.0/24'])
    // 192.0.2.0 is /23-aligned, so 768 addresses are a /23 plus a /24.
    expect(rangeToCidrs(start, 768n).map((p) => p.cidr)).toEqual(['192.0.2.0/23', '192.0.4.0/24'])
    const odd = parseIp('192.0.3.0')!.value
    expect(rangeToCidrs(odd, 512n).map((p) => p.cidr)).toEqual(['192.0.3.0/24', '192.0.4.0/24'])
    expect(rangeToCidrs(parseIp('10.0.0.0')!.value, 512n).map((p) => p.cidr)).toEqual([
      '10.0.0.0/23',
    ])
  })
  it('parses delegated lines', () => {
    expect(
      parseDelegatedLine('ripencc|NL|ipv4|193.0.0.0|2048|19930901|allocated|x').map(
        (r) => r.prefix.cidr,
      ),
    ).toEqual(['193.0.0.0/21'])
    expect(parseDelegatedLine('arin|US|ipv6|2001:db8::|32|2001|assigned|x')[0]?.value).toBe(1)
    expect(parseDelegatedLine('apnic|AU|ipv4|1.0.0.0|256|2011|available|x')).toEqual([])
    expect(parseDelegatedLine('nro|*|ipv4|*|271251|summary')).toEqual([])
    expect(parseDelegatedLine('ripencc|NL|asn|3333|1|1993|allocated|x')).toEqual([])
  })
  it('parses Registro.BR lines', () => {
    expect(
      parseRegistroBrLine('AS1|Foo|doc|200.0.0.0/16|2001:12f0::/32').map((r) => r.prefix.cidr),
    ).toEqual(['200.0.0.0/16', '2001:12f0::/32'])
  })
  it('parses the recorded fixture', () => {
    const rows = fixtureText('rirstats/nro-delegated-stats.txt')
      .split('\n')
      .flatMap(parseDelegatedLine)
    expect(rows.length).toBeGreaterThan(50)
  })
})
