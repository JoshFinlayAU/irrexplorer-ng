// A small GeoLite2-City stand-in covering the prefixes the tests use. The
// data is made up but shaped like the real thing, including a prefix split
// across countries and one registered in a different country.
import { cityRecord, maxmindTarball, writeMmdb, type MmdbEntry } from './mmdb-writer.ts'

export const GEO_ENTRIES: MmdbEntry[] = [
  {
    network: '193.0.0.0/20',
    data: cityRecord({
      country: 'NL',
      countryName: 'Netherlands',
      city: 'Amsterdam',
      region: 'North Holland',
      lat: 52.3759,
      lon: 4.8975,
      radius: 20,
    }),
  },
  // A quarter of 193.0.0.0/21 is somewhere else, so the shares are visible.
  { network: '193.0.6.0/23', data: cityRecord({ country: 'DE', countryName: 'Germany' }) },
  {
    network: '2001:67c:2e8::/48',
    data: cityRecord({
      country: 'NL',
      countryName: 'Netherlands',
      city: 'Amsterdam',
      lat: 52.37,
      lon: 4.89,
      radius: 50,
    }),
  },
  {
    network: '8.8.8.0/24',
    data: cityRecord({
      country: 'US',
      countryName: 'United States',
      lat: 37.751,
      lon: -97.822,
      radius: 1000,
    }),
  },
  { network: '8.0.0.0/12', data: cityRecord({ country: 'US', countryName: 'United States' }) },
  {
    network: '137.17.80.0/24',
    data: cityRecord({
      country: 'AU',
      countryName: 'Australia',
      city: 'Sydney',
      region: 'New South Wales',
      registered: 'US',
      lat: -33.86,
      lon: 151.2,
      radius: 100,
    }),
  },
]

export const GEO_BUILD_EPOCH = 1793232000 // 2026-10-29

export function geoFixtureDb(): Buffer {
  // Less specific first: the writer lets later entries win.
  const ordered = [...GEO_ENTRIES].sort(
    (a, b) => Number(a.network.split('/')[1]) - Number(b.network.split('/')[1]),
  )
  return writeMmdb(ordered, { buildEpoch: GEO_BUILD_EPOCH })
}

export function geoFixtureTarball(): Buffer {
  return maxmindTarball('GeoLite2-City', geoFixtureDb())
}

export const GEO_LAST_MODIFIED = 'Thu, 29 Oct 2026 14:12:01 GMT'
