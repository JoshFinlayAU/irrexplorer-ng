// PeeringDB record of a network: what it says about itself, where it peers and
// how to reach it. Most of this is context and stays in ink; colour is kept
// for the checks against the routing data (max-prefix and the AS-set).
import { useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { maxPrefixState, parseIrrAsSet, speedText } from '~/lib/analysis/peeringdb'
import type {
  PdbAvailability,
  PdbFacility,
  PdbIxConnection,
  PdbNetwork,
} from '~/lib/analysis/types'
import { formatAsn } from '~/lib/parse'
import { memberOfQuery } from '~/lib/queries'
import { FactStrip, SectionHead, type Fact } from './ui'

export const PDB = 'https://www.peeringdb.com'

const muted = (s: ReactNode) => <span className="text-[var(--muted)]">{s}</span>
const faint = (s: ReactNode) => <span className="text-[var(--faint)]">{s}</span>

/** Only http(s) values become links; PeeringDB fields are free text. */
export function ExternalLink({ href, children }: { href: string; children?: ReactNode }) {
  if (!/^https?:\/\//i.test(href)) return <span>{children ?? href}</span>
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children ?? href.replace(/^https?:\/\//i, '').replace(/\/$/, '')}
    </a>
  )
}

export function pdbMissingText(state: PdbAvailability): string {
  return state === 'disabled' ? 'PeeringDB disabled' : 'PeeringDB unavailable'
}

export function place(city: string, country: string): string {
  return [city, country].filter(Boolean).join(', ')
}

function MaxPrefix({
  family,
  limit,
  announced,
}: {
  family: string
  limit: number | null
  announced: number
}) {
  const state = maxPrefixState(announced, limit)
  const tone =
    state === 'over'
      ? 'text-[var(--danger-fg)]'
      : state === 'near'
        ? 'text-[var(--warning-fg)]'
        : ''
  return (
    <span className={`block ${tone}`}>
      {family} {limit ? limit.toLocaleString('en-US') : faint('not set')}{' '}
      <span className={tone ? '' : 'text-[var(--muted)]'}>
        ({announced.toLocaleString('en-US')} announced
        {state === 'over' ? ', over the limit' : state === 'near' ? ', near the limit' : ''})
      </span>
    </span>
  )
}

/** The AS-sets named in PeeringDB, marked where IRRd lists the ASN as a direct member. */
function AsSets({ asn, text }: { asn: number; text: string }) {
  const label = formatAsn(asn)
  const { data } = useSuspenseQuery(memberOfQuery(label, 'as-set'))
  const refs = parseIrrAsSet(text)
  if (refs.length === 0) return text ? <span>{text}</span> : faint('not set')
  const direct = data.ok ? new Set(Object.values(data.memberOf.setsPerIrr).flat()) : null
  return (
    <span className="flex flex-col">
      {refs.map((r) => (
        <span key={`${r.source}|${r.name}`} className="flex flex-wrap items-baseline gap-x-2">
          {r.name.startsWith('AS-') || r.name.includes(':') ? (
            <Link to="/as-set/$name" params={{ name: r.name }}>
              {r.name}
            </Link>
          ) : (
            <Link to="/asn/$asn" params={{ asn: r.name }}>
              {r.name}
            </Link>
          )}
          {r.source ? muted(r.source) : null}
          {direct?.has(r.name)
            ? muted(`lists ${label}`)
            : direct && r.name !== label
              ? faint(`${label} not a direct member`)
              : null}
        </span>
      ))}
    </span>
  )
}

function networkFacts(net: PdbNetwork, announced: { v4: number; v6: number }): Fact[] {
  const facts: Fact[] = [
    {
      label: 'Network',
      value: (
        <span className="flex flex-col">
          <a href={`${PDB}/net/${net.id}`} target="_blank" rel="noreferrer">
            {net.name}
          </a>
          {net.aka ? muted(net.aka) : null}
          {net.nameLong && net.nameLong !== net.name ? muted(net.nameLong) : null}
        </span>
      ),
      wide: true,
    },
  ]
  if (net.org)
    facts.push({
      label: 'Organisation',
      value: (
        <span className="flex flex-col">
          <a href={`${PDB}/org/${net.org.id}`} target="_blank" rel="noreferrer">
            {net.org.name}
          </a>
          {place(net.org.city, net.org.country)
            ? muted(place(net.org.city, net.org.country))
            : null}
        </span>
      ),
      wide: true,
    })
  facts.push({ label: 'Type', value: net.types.join(', ') || faint('not set') })
  if (net.scope) facts.push({ label: 'Scope', value: net.scope })
  if (net.traffic) facts.push({ label: 'Traffic', value: net.traffic })
  if (net.ratio) facts.push({ label: 'Ratio', value: net.ratio })
  const p = net.policy
  facts.push({
    label: 'Peering policy',
    value: (
      <span className="flex flex-col">
        <span>
          {p.general || faint('not set')}
          {p.url ? (
            <>
              {' '}
              <ExternalLink href={p.url}>policy</ExternalLink>
            </>
          ) : null}
        </span>
        {[
          p.locations && `locations ${p.locations.toLowerCase()}`,
          p.ratio && 'ratio required',
          p.contracts && `contracts ${p.contracts.toLowerCase()}`,
        ]
          .filter(Boolean)
          .map((t) => (
            <span key={String(t)} className="text-[var(--muted)]">
              {t}
            </span>
          ))}
      </span>
    ),
    wide: true,
  })
  facts.push({
    label: 'Max prefixes',
    value: (
      <>
        <MaxPrefix family="v4" limit={net.prefixes4} announced={announced.v4} />
        <MaxPrefix family="v6" limit={net.prefixes6} announced={announced.v6} />
      </>
    ),
    wide: true,
  })
  facts.push({
    label: 'IRR AS-set',
    value: <AsSets asn={net.asn} text={net.irrAsSet} />,
    wide: true,
  })
  facts.push({
    label: 'Protocols',
    value: (
      <span className="flex flex-col">
        <span>
          {[net.unicast && 'unicast', net.multicast && 'multicast', net.ipv6 && 'IPv6']
            .filter(Boolean)
            .join(', ') || faint('none listed')}
        </span>
        {net.neverViaRouteServers ? muted('never via route servers') : null}
      </span>
    ),
  })
  facts.push({
    label: 'Presence',
    value: `${new Set(net.exchanges.map((x) => x.ixId)).size} IXs, ${net.facilities.length} facilities`,
  })
  const links: [string, string][] = [
    ['Website', net.website],
    ['Looking glass', net.lookingGlass],
    ['Route server', net.routeServer],
    ['Status page', net.statusDashboard],
  ]
  for (const [label, href] of links)
    if (href) facts.push({ label, value: <ExternalLink href={href} />, wide: true })
  return facts
}

const th = 'label border-b border-[var(--rule-strong)] px-3 py-1.5 text-left whitespace-nowrap'
const td = 'px-3 py-1.5 align-baseline'

/** A details block that starts open when the list is short. */
function Disclosure({
  title,
  count,
  open = false,
  children,
}: {
  title: string
  count: string
  open?: boolean
  children: ReactNode
}) {
  return (
    <details
      open={open}
      className="mb-3 border border-[var(--rule)] bg-[var(--panel)] [&[open]>summary]:border-b"
    >
      <summary className="cursor-pointer border-[var(--rule)] px-3 py-2 hover:text-[var(--text)]">
        <span className="label">{title}</span>{' '}
        <span className="font-mono text-[0.75rem] text-[var(--muted)]">{count}</span>
      </summary>
      {children}
    </details>
  )
}

function Exchanges({ rows }: { rows: PdbIxConnection[] }) {
  const ixs = new Set(rows.map((r) => r.ixId)).size
  return (
    <Disclosure
      title="Exchanges"
      open={rows.length <= 12}
      count={`${rows.length} ${rows.length === 1 ? 'port' : 'ports'} at ${ixs} ${ixs === 1 ? 'IX' : 'IXs'}`}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-[0.78rem]">
          <thead className="bg-[var(--sunk)]">
            <tr>
              {['Exchange', 'Location', 'Speed', 'IPv4', 'IPv6', 'Route server', 'BFD'].map((h) => (
                <th key={h} scope="col" className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={`${r.ixId}-${r.ipv4 ?? ''}-${r.ipv6 ?? ''}-${i}`}
                className={`border-b border-[var(--rule)] last:border-b-0 ${r.operational ? '' : 'text-[var(--muted)]'}`}
              >
                <td className={`${td} whitespace-nowrap`}>
                  <a href={`${PDB}/ix/${r.ixId}`} target="_blank" rel="noreferrer">
                    {r.ix}
                  </a>
                  {r.operational ? null : (
                    <span className="ml-2 text-[0.7rem] text-[var(--faint)]">not operational</span>
                  )}
                </td>
                <td className={td}>
                  {/* Some exchanges list every metro they reach; keep the row to one line. */}
                  <span className="block max-w-[14rem] truncate" title={place(r.city, r.country)}>
                    {place(r.city, r.country)}
                  </span>
                </td>
                <td className={`${td} tabular-nums`}>{speedText(r.speed)}</td>
                <td className={td}>
                  {r.ipv4 ? (
                    <Link to="/prefix/$" params={{ _splat: r.ipv4 }}>
                      {r.ipv4}
                    </Link>
                  ) : (
                    faint('--')
                  )}
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  {r.ipv6 ? (
                    <Link to="/prefix/$" params={{ _splat: r.ipv6 }}>
                      {r.ipv6}
                    </Link>
                  ) : (
                    faint('--')
                  )}
                </td>
                <td className={td}>{r.routeServer ? 'yes' : faint('no')}</td>
                <td className={td}>{r.bfd ? 'yes' : faint('no')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Disclosure>
  )
}

function Facilities({ rows }: { rows: PdbFacility[] }) {
  return (
    <Disclosure title="Facilities" count={`${rows.length}`} open={rows.length <= 12}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-[0.78rem]">
          <thead className="bg-[var(--sunk)]">
            <tr>
              {['Facility', 'City', 'Country', 'Local ASN'].map((h) => (
                <th key={h} scope="col" className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.facId} className="border-b border-[var(--rule)] last:border-b-0">
                <td className={td}>
                  <a href={`${PDB}/fac/${r.facId}`} target="_blank" rel="noreferrer">
                    {r.name}
                  </a>
                </td>
                <td className={td}>{r.city}</td>
                <td className={td}>{r.country}</td>
                <td className={td}>
                  {r.localAsn !== null ? (
                    <Link to="/asn/$asn" params={{ asn: formatAsn(r.localAsn) }}>
                      {formatAsn(r.localAsn)}
                    </Link>
                  ) : (
                    faint('same')
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Disclosure>
  )
}

function Contacts({ net }: { net: PdbNetwork }) {
  return (
    <div className="mb-3 border border-[var(--rule)] bg-[var(--panel)]">
      <div className="label border-b border-[var(--rule)] px-3 py-1.5">Public contacts</div>
      {net.contacts.length === 0 ? (
        <p className="px-3 py-2 font-mono text-[0.78rem] text-[var(--muted)]">
          None public. PeeringDB shows this network&apos;s contacts to logged-in users only.
        </p>
      ) : (
        <ul className="font-mono text-[0.78rem]">
          {net.contacts.map((c, i) => (
            <li
              key={`${c.role}-${c.email}-${i}`}
              className="grid gap-x-4 border-b border-[var(--rule)] px-3 py-1.5 last:border-b-0 sm:grid-cols-[8rem_1fr_auto]"
            >
              <span className="label self-baseline">{c.role}</span>
              <span className="flex flex-wrap gap-x-3">
                {c.name ? <span>{c.name}</span> : null}
                {c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : null}
                {c.url ? <ExternalLink href={c.url} /> : null}
              </span>
              <span className="text-[var(--muted)]">{c.phone}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The PeeringDB section of the ASN page. */
export function PeeringDbSection({
  asn,
  net,
  state,
  announced,
}: {
  asn: number
  net: PdbNetwork | null
  state: PdbAvailability
  announced: { v4: number; v6: number }
}) {
  return (
    <section aria-labelledby="pdb-title" className="mb-10">
      <SectionHead
        id="pdb-title"
        title="PeeringDB"
        meta={
          net ? (
            <>
              <span className="font-mono text-[0.75rem] text-[var(--muted)]">
                updated {net.updated.slice(0, 10)}
              </span>
              <a
                href={`${PDB}/net/${net.id}`}
                target="_blank"
                rel="noreferrer"
                className="label hover:text-[var(--text)]"
              >
                Open in PeeringDB
              </a>
            </>
          ) : undefined
        }
      />
      {!net ? (
        <p className="border border-dashed border-[var(--rule-strong)] px-3 py-4 text-center font-mono text-[0.8rem] text-[var(--muted)]">
          {state === 'ok'
            ? `${formatAsn(asn)} has no PeeringDB record.`
            : `${pdbMissingText(state)}.`}
        </p>
      ) : (
        <>
          <div className="mb-3">
            <FactStrip label="PeeringDB record" facts={networkFacts(net, announced)} />
          </div>
          <Contacts net={net} />
          {net.exchanges.length > 0 ? <Exchanges rows={net.exchanges} /> : null}
          {net.facilities.length > 0 ? <Facilities rows={net.facilities} /> : null}
          {net.notes ? (
            <Disclosure title="Notes" count="from the network">
              <p className="max-h-96 overflow-auto px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
                {net.notes}
              </p>
            </Disclosure>
          ) : null}
        </>
      )}
    </section>
  )
}
