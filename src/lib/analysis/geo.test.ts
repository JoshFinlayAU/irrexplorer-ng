import { Reader, type CityResponse } from 'mmdb-lib'
import { describe, expect, it } from 'vitest'
import { geoFixtureDb } from '../../../test/geo-fixture'
import { cityRecord, writeMmdb } from '../../../test/mmdb-writer'
import { parsePrefix } from '../ip'
import { geoOfPrefix, mergeGeo, type GeoLookup, type GeoRecord } from './geo'

const P = (s: string) => parsePrefix(s)!
const lookupFor = (db: Buffer): GeoLookup => {
  const reader = new Reader<CityResponse>(db)
  return (ip) => reader.getWithPrefixLength(ip) as [GeoRecord | null, number]
}
const fixture = lookupFor(geoFixtureDb())

describe('geoOfPrefix', () => {
  it('gives one country and city detail when one network covers the prefix', () => {
    const geo = geoOfPrefix(P('193.0.0.0/24'), fixture, { place: true })
    expect(geo.countries).toEqual([{ code: 'NL', name: 'Netherlands', share: 1 }])
    expect(geo).toMatchObject({ networks: 1, estimated: false, unknown: 0, other: 0 })
    expect(geo.place).toMatchObject({ city: 'Amsterdam', region: 'North Holland', radiusKm: 20 })
  })

  it('weights countries by address count across networks', () => {
    const geo = geoOfPrefix(P('193.0.0.0/21'), fixture, { place: true })
    expect(geo.countries).toEqual([
      { code: 'NL', name: 'Netherlands', share: 0.75 },
      { code: 'DE', name: 'Germany', share: 0.25 },
    ])
    expect(geo.networks).toBeGreaterThan(1)
    // City detail would be misleading for a prefix spread over two countries.
    expect(geo.place).toBeNull()
  })

  it('counts addresses with no data as unknown', () => {
    const geo = geoOfPrefix(P('193.0.0.0/19'), fixture)
    expect(geo.countries.map((c) => [c.code, c.share])).toEqual([
      ['NL', 0.4375],
      ['DE', 0.0625],
    ])
    expect(geo.unknown).toBe(0.5)
  })

  it('handles a host and IPv6', () => {
    expect(geoOfPrefix(P('137.17.80.9/32'), fixture, { place: true }).place).toMatchObject({
      country: 'AU',
      registered: 'US',
      city: 'Sydney',
    })
    expect(geoOfPrefix(P('2001:67c:2e8::/48'), fixture).countries[0]?.code).toBe('NL')
    expect(geoOfPrefix(P('2001:db8::/32'), fixture).unknown).toBe(1)
  })

  it('samples a prefix spanning more networks than the budget', () => {
    // 256 separate /24s inside a /16, the first quarter in France.
    const entries = Array.from({ length: 256 }, (_, i) => ({
      network: `10.1.${i}.0/24`,
      data:
        i < 64
          ? cityRecord({ country: 'FR', countryName: 'France' })
          : cityRecord({ country: 'BE', countryName: 'Belgium' }),
    }))
    const geo = geoOfPrefix(P('10.1.0.0/16'), lookupFor(writeMmdb(entries)), {
      maxSteps: 16,
      samples: 128,
    })
    expect(geo.estimated).toBe(true)
    expect(geo.countries.map((c) => [c.code, c.share])).toEqual([
      ['BE', 0.75],
      ['FR', 0.25],
    ])
    // Walked fully, the same answer comes out exactly.
    const exact = geoOfPrefix(P('10.1.0.0/16'), lookupFor(writeMmdb(entries)), { maxSteps: 512 })
    expect(exact).toMatchObject({ estimated: false, networks: 256 })
  })

  it('folds the tail into other', () => {
    const entries = ['AA', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH'].map((code, i) => ({
      network: `10.2.${i * 32}.0/19`,
      data: cityRecord({ country: code, countryName: code }),
    }))
    const geo = geoOfPrefix(P('10.2.0.0/16'), lookupFor(writeMmdb(entries)), { maxCountries: 3 })
    expect(geo.countries).toHaveLength(3)
    expect(geo.other).toBe(0.625)
  })
})

describe('mergeGeo', () => {
  it('weights prefixes by size and counts nested prefixes once', () => {
    const a = geoOfPrefix(P('193.0.0.0/21'), fixture)
    const nested = geoOfPrefix(P('193.0.6.0/24'), fixture)
    const us = geoOfPrefix(P('8.8.8.0/24'), fixture)
    const merged = mergeGeo([
      { prefix: P('193.0.0.0/21'), geo: a },
      { prefix: P('193.0.6.0/24'), geo: nested },
      { prefix: P('8.8.8.0/24'), geo: us },
    ])!
    // 2048 + 256 addresses: NL 1536, DE 512, US 256.
    expect(merged.countries.map((c) => c.code)).toEqual(['NL', 'DE', 'US'])
    expect(merged.countries[0]!.share).toBeCloseTo(1536 / 2304, 4)
  })

  it('uses IPv6 only when there is no IPv4', () => {
    const v6 = geoOfPrefix(P('2001:67c:2e8::/48'), fixture)
    expect(mergeGeo([{ prefix: P('2001:67c:2e8::/48'), geo: v6 }])!.countries[0]!.code).toBe('NL')
    expect(mergeGeo([])).toBeNull()
  })
})
