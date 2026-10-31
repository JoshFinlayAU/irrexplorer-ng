// GeoLite2 location, shown as ISO country codes with address shares. Location
// is context, not a consistency state, so it stays in ink rather than colour.
import type { GeoAvailability, GeoBreakdown, GeoPlace, PrefixGeo } from '~/lib/analysis/types'

export function shareText(share: number): string {
  if (share >= 0.995) return '100%'
  if (share > 0 && share < 0.01) return '<1%'
  return `${Math.round(share * 100)}%`
}

/** One line for a row: "NL" for a single country, else "NL 75% DE 25%". */
export function geoSummaryText(geo: GeoBreakdown | PrefixGeo): string {
  if (geo.countries.length === 0) return 'no data'
  if (geo.countries.length === 1 && geo.countries[0]!.share >= 0.995) return geo.countries[0]!.code
  const parts = geo.countries.map((c) => `${c.code} ${shareText(c.share)}`)
  if (geo.other > 0.005) parts.push(`other ${shareText(geo.other)}`)
  return parts.join(' ')
}

/** Full sentence for titles and screen readers. */
export function geoDescription(geo: GeoBreakdown | PrefixGeo): string {
  if (geo.countries.length === 0) return 'No GeoLite2 location'
  const parts = geo.countries.map((c) => `${c.name} ${shareText(c.share)}`)
  if (geo.other > 0.005) parts.push(`other countries ${shareText(geo.other)}`)
  if (geo.unknown > 0.005) parts.push(`unknown ${shareText(geo.unknown)}`)
  const est = 'estimated' in geo && geo.estimated ? ' (estimated from a sample)' : ''
  return `GeoLite2 location: ${parts.join(', ')}${est}`
}

/** Compact country codes for a prefix record header or table cell. */
export function GeoCodes({ geo }: { geo: PrefixGeo | null | undefined }) {
  if (geo === undefined) return null
  if (geo === null || geo.countries.length === 0)
    return (
      <span
        className="font-mono text-[0.72rem] text-[var(--faint)]"
        title={geo ? 'No GeoLite2 location' : 'GeoIP unavailable'}
      >
        <span aria-hidden="true">--</span>
        <span className="sr-only">{geo ? 'No GeoLite2 location' : 'GeoIP unavailable'}</span>
      </span>
    )
  const desc = geoDescription(geo)
  return (
    <span className="font-mono text-[0.72rem] whitespace-nowrap" title={desc}>
      <span aria-hidden="true">
        {geoSummaryText(geo)}
        {geo.estimated ? '~' : ''}
      </span>
      <span className="sr-only">{desc}</span>
    </span>
  )
}

/** Proportional strip of country shares, ink only, with codes underneath. */
export function GeoShares({ geo }: { geo: GeoBreakdown | PrefixGeo }) {
  const segments = [
    ...geo.countries.map((c) => ({
      key: c.code,
      label: c.code,
      title: `${c.name} ${shareText(c.share)}`,
      share: c.share,
    })),
    ...(geo.other > 0.005
      ? [
          {
            key: '~other',
            label: 'other',
            title: `Other countries ${shareText(geo.other)}`,
            share: geo.other,
          },
        ]
      : []),
  ]
  const estimated = 'estimated' in geo && geo.estimated
  return (
    <span className="flex flex-col gap-1">
      <span aria-hidden="true" className="flex h-1.5 w-full max-w-64 bg-[var(--rule)]">
        {segments.map((s, i) => (
          <span
            key={s.key}
            title={s.title}
            className="h-full border-r border-[var(--panel)] bg-[var(--text)] last:border-r-0"
            style={{ width: `${s.share * 100}%`, opacity: Math.max(0.35, 1 - i * 0.18) }}
          />
        ))}
      </span>
      <span className="flex flex-wrap gap-x-3">
        {geo.countries.map((c) => (
          <span key={c.code} title={c.name}>
            {c.code} <span className="text-[var(--muted)]">{shareText(c.share)}</span>
          </span>
        ))}
        {geo.other > 0.005 ? (
          <span>
            other <span className="text-[var(--muted)]">{shareText(geo.other)}</span>
          </span>
        ) : null}
        {geo.unknown > 0.005 ? (
          <span className="text-[var(--faint)]">no data {shareText(geo.unknown)}</span>
        ) : null}
        {estimated ? <span className="text-[var(--faint)]">sampled</span> : null}
      </span>
      <span className="sr-only">{geoDescription(geo)}</span>
    </span>
  )
}

export function placeText(p: GeoPlace): string {
  return [p.city, p.region, p.countryName ?? p.country].filter(Boolean).join(', ')
}

export function osmLink(p: GeoPlace): string | null {
  if (p.latitude === null || p.longitude === null) return null
  const zoom =
    p.radiusKm !== null && p.radiusKm <= 50 ? 10 : p.radiusKm !== null && p.radiusKm <= 200 ? 7 : 4
  return `https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=${zoom}/${p.latitude}/${p.longitude}`
}

export function GeoPlaceView({ place }: { place: GeoPlace }) {
  const href = osmLink(place)
  return (
    <span className="flex flex-col gap-0.5">
      <span>{placeText(place) || <span className="text-[var(--faint)]">no location</span>}</span>
      <span className="flex flex-wrap gap-x-3 text-[0.78rem] text-[var(--muted)]">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" title="Open in OpenStreetMap">
            {place.latitude!.toFixed(4)}, {place.longitude!.toFixed(4)}
          </a>
        ) : null}
        {place.radiusKm !== null ? (
          <span title="GeoLite2 accuracy radius">±{place.radiusKm} km</span>
        ) : null}
        {place.registered && place.registered !== place.country ? (
          <span title={`Registered to ${place.registeredName ?? place.registered}`}>
            registered {place.registered}
          </span>
        ) : null}
      </span>
    </span>
  )
}

/** Value for the "Location" fact when there is nothing to show. */
export function geoMissingText(state: GeoAvailability): string {
  return state === 'unconfigured' ? 'GeoIP not configured' : 'GeoIP unavailable'
}
