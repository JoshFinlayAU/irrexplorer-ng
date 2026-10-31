// The record view: one block per prefix, with an origin x source matrix.
// Rows are every origin ASN seen anywhere (BGP, ROAs, IRR); columns are BGP,
// ROA and each IRR source. Disagreement shows up as a ragged row.
import { Link } from '@tanstack/react-router'
import { parsePrefix, prefixSize } from '~/lib/ip'
import { lookingGlassUrl } from '~/lib/links'
import type { IrrRoute, PrefixSummary, RpkiValidity } from '~/lib/analysis/types'
import { describeValidity } from '~/lib/analysis/rpki'
import { GeoCodes } from './geo'
import { ExternalIcon } from './icons'
import { MessageList, RpkiWord, SeverityTag, edgeClass } from './status'
import { VirtualList } from './virtual-list'
import type { WhoisTarget } from './whois-dialog'

function addressCount(cidr: string): string {
  const p = parsePrefix(cidr)
  if (!p) return ''
  if (p.version === 6) {
    const bits = 128 - p.length
    if (bits < 64) return `2^${bits} addr`
    return bits - 64 <= 16
      ? `${(2 ** (bits - 64)).toLocaleString('en-US')} x /64`
      : `2^${bits - 64} x /64`
  }
  return `${prefixSize(p).toLocaleString('en-US')} addr`
}

const Empty = ({ what }: { what: string }) => (
  <span className="text-[var(--faint)]" title={`No ${what}`}>
    <span aria-hidden="true">·</span>
    <span className="sr-only">none</span>
  </span>
)

function IrrCell({ routes, onWhois }: { routes: IrrRoute[]; onWhois: (r: IrrRoute) => void }) {
  if (routes.length === 0) return <Empty what="route object" />
  return (
    <>
      {routes.map((r) => (
        <button
          key={r.rpslPk}
          type="button"
          onClick={() => onWhois(r)}
          title={`Show route object ${r.rpslPk}. ${describeValidity(r.rpki)}`}
          className={`hover:bg-[var(--sunk)] ${r.rpki.state === 'invalid' ? 'line-through decoration-[var(--danger-fg)]' : ''}`}
        >
          <RpkiWord validity={r.rpki} />
          <span className="sr-only">. Show route object</span>
        </button>
      ))}
    </>
  )
}

interface OriginRow {
  asn: number
  bgp: RpkiValidity | null
  roas: number[]
  irr: Record<string, IrrRoute[]>
}

function originRows(r: PrefixSummary): OriginRow[] {
  const map = new Map<number, OriginRow>()
  const get = (asn: number) => {
    let row = map.get(asn)
    if (!row) {
      row = { asn, bgp: null, roas: [], irr: {} }
      map.set(asn, row)
    }
    return row
  }
  for (const o of r.bgpOrigins) get(o.asn).bgp = o.rpki
  for (const roa of r.rpkiRoutes) get(roa.asn).roas.push(roa.maxLength)
  for (const [source, list] of Object.entries(r.irrRoutes)) {
    for (const route of list) (get(route.asn).irr[source] ??= []).push(route)
  }
  // BGP origins first, then by ASN.
  return [...map.values()].sort((a, b) => Number(!a.bgp) - Number(!b.bgp) || a.asn - b.asn)
}

export function PrefixRecord({
  row,
  sources,
  asNames,
  reduced,
  onWhois,
}: {
  row: PrefixSummary
  sources: string[]
  asNames: Record<string, string>
  reduced: boolean
  onWhois: (t: WhoisTarget) => void
}) {
  const origins = originRows(row)
  const titleId = `rec-${row.prefix.replace(/[^0-9a-f]/gi, '-')}`
  return (
    <article
      aria-labelledby={titleId}
      className={`border-b border-l-[3px] border-[var(--rule)] bg-[var(--panel)] ${
        reduced ? 'border-l-[var(--rule-strong)]' : edgeClass[row.categoryOverall]
      }`}
    >
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-dashed border-[var(--rule)] px-3 py-2">
        <h3 id={titleId} className="font-mono text-[0.95rem] font-semibold">
          <Link
            to="/prefix/$"
            params={{ _splat: row.prefix }}
            className="no-underline hover:underline"
          >
            {row.prefix}
          </Link>
        </h3>
        <SeverityTag category={row.categoryOverall} reduced={reduced} />
        <span className="font-mono text-[0.75rem] text-[var(--muted)]">
          {row.rir ?? 'no RIR'}
          <span className="px-2 text-[var(--faint)]">|</span>
          {addressCount(row.prefix)}
          {row.geo !== undefined ? (
            <>
              <span className="px-2 text-[var(--faint)]">|</span>
              <GeoCodes geo={row.geo} />
            </>
          ) : null}
        </span>
        {row.bgpOrigins.length > 0 ? (
          <a
            href={lookingGlassUrl(row.prefix)}
            target="_blank"
            rel="noreferrer"
            className="label ml-auto inline-flex items-center gap-1 no-underline hover:text-[var(--text)]"
          >
            Looking glass <ExternalIcon />
          </a>
        ) : null}
      </header>
      <div className="grid gap-x-6 gap-y-2 px-3 py-2 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="overflow-x-auto">
          <table className="table-fixed border-collapse font-mono text-[0.78rem]">
            <caption className="sr-only">Origins of {row.prefix} by source</caption>
            <colgroup>
              <col className="w-[15rem]" />
              <col className="w-[7.5rem]" />
              <col className="w-[7.5rem]" />
              {sources.map((s) => (
                <col key={s} className="w-[7rem]" />
              ))}
            </colgroup>
            <thead>
              <tr className="text-left">
                <th scope="col" className="label py-1 pr-4 font-medium">
                  Origin
                </th>
                <th scope="col" className="label py-1 pr-4 font-medium">
                  BGP
                </th>
                <th scope="col" className="label py-1 pr-4 font-medium">
                  ROA
                </th>
                {sources.map((s) => (
                  <th key={s} scope="col" className="label py-1 pr-4 font-medium">
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {origins.map((o) => (
                <tr key={o.asn} className="border-t border-[var(--rule)] align-baseline">
                  <th scope="row" className="py-1 pr-4 text-left font-normal whitespace-nowrap">
                    <Link
                      to="/asn/$asn"
                      params={{ asn: `AS${o.asn}` }}
                      className="no-underline hover:underline"
                    >
                      AS{o.asn}
                    </Link>
                    {asNames[o.asn] ? (
                      <span
                        title={asNames[o.asn]}
                        className="ml-2 hidden max-w-[17ch] truncate align-bottom font-sans text-[0.72rem] text-[var(--faint)] lg:inline-block"
                      >
                        {asNames[o.asn]}
                      </span>
                    ) : null}
                  </th>
                  <td className="py-1 pr-4 whitespace-nowrap">
                    {o.bgp ? <RpkiWord validity={o.bgp} /> : <Empty what="BGP announcement" />}
                  </td>
                  <td className="py-1 pr-4 whitespace-nowrap">
                    {o.roas.length > 0 ? (
                      <span title="ROA max length">
                        {o.roas
                          .sort((a, b) => a - b)
                          .map((m) => `max /${m}`)
                          .join(', ')}
                      </span>
                    ) : (
                      <Empty what="ROA" />
                    )}
                  </td>
                  {sources.map((s) => (
                    <td key={s} className="py-1 pr-4 whitespace-nowrap">
                      <IrrCell
                        routes={o.irr[s] ?? []}
                        onWhois={(r) =>
                          onWhois({
                            prefix: row.prefix,
                            asn: r.asn,
                            source: s,
                            rpslPk: r.rpslPk,
                            rpki: r.rpki,
                          })
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="xl:border-l xl:border-[var(--rule)] xl:pl-6">
          <MessageList messages={row.messages} reduced={reduced} />
        </div>
      </div>
    </article>
  )
}

export function PrefixRecords({
  rows,
  asNames,
  reduced,
  onWhois,
  label,
}: {
  rows: PrefixSummary[]
  asNames: Record<string, string>
  reduced: boolean
  onWhois: (t: WhoisTarget) => void
  label: string
}) {
  const sources = [...new Set(rows.flatMap((r) => Object.keys(r.irrRoutes)))].sort()
  return (
    <VirtualList
      label={label}
      items={rows}
      estimateSize={150}
      getKey={(r) => r.prefix}
      className="border-t border-[var(--rule)]"
      renderItem={(row) => (
        <PrefixRecord
          row={row}
          sources={sources}
          asNames={asNames}
          reduced={reduced}
          onWhois={onWhois}
        />
      )}
    />
  )
}
