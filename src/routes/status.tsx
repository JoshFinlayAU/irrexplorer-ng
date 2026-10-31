import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Pending } from '~/components/route-states'
import { SeverityTag } from '~/components/status'
import { SectionHead } from '~/components/ui'
import { Timestamp } from '~/components/time'
import { statusQuery } from '~/lib/queries'

export const Route = createFileRoute('/status')({
  loader: ({ context }) => context.queryClient.query(statusQuery()),
  head: () => ({ meta: [{ title: 'IRR Explorer NG: data status' }] }),
  pendingComponent: () => <Pending label="Checking data sources" />,
  component: StatusPage,
})

const DATASET_INFO: Record<string, { label: string; href: string }> = {
  'bgp.tools table': {
    label: 'Prefix to DFZ origin mapping from bgp.tools',
    href: 'https://bgp.tools/',
  },
  'bgp.tools AS names': { label: 'AS names from bgp.tools', href: 'https://bgp.tools/' },
  'MaxMind GeoLite2': {
    label: 'Prefix geolocation from MaxMind GeoLite2',
    href: 'https://dev.maxmind.com/geoip/geolite2-free-geolocation-data',
  },
  'RIR delegations': {
    label: 'Prefix to RIR mapping from NRO delegated stats and Registro.BR',
    href: 'https://www.nro.net/about/rirs/statistics/',
  },
}

const UPSTREAM_LABEL: Record<string, string> = {
  irrd: 'IRRd GraphQL',
  ripestat: 'RIPEstat',
  bgptools: 'bgp.tools',
  rirstats: 'RIR delegated stats',
  maxmind: 'MaxMind downloads',
}

function StatusPage() {
  const { data } = useSuspenseQuery(statusQuery())
  return (
    <div className="max-w-5xl">
      <p className="label mb-1">sources</p>
      <h1 className="mb-2 text-[2rem] font-semibold tracking-tight">Data status</h1>
      <p className="mb-8 text-[var(--muted)]">
        This page shows the last update times for all IRR Explorer data sources.
      </p>

      <SectionHead title="Bulk datasets" />
      <p className="mb-3 max-w-[75ch] text-sm text-[var(--muted)]">
        Downloaded on a schedule and held in memory. The time is when IRR Explorer last loaded the
        data, not when the source published it.
      </p>
      <div className="mb-10 overflow-x-auto border border-[var(--rule)] bg-[var(--panel)]">
        <table className="w-full border-collapse font-mono text-[0.8rem]">
          <thead className="bg-[var(--sunk)]">
            <tr>
              {['Source', 'Last update', 'Rows / release', 'State'].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="label border-b border-[var(--rule-strong)] px-3 py-2 text-left"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.datasets.map((d) => {
              const info = DATASET_INFO[d.name]
              const off = d.name === 'MaxMind GeoLite2' && !data.geoip.configured
              return (
                <tr key={d.name} className="border-b border-[var(--rule)] last:border-b-0">
                  <td className="px-3 py-2">
                    {info ? <a href={info.href}>{info.label}</a> : d.name}
                  </td>
                  <td className="px-3 py-2">
                    <Timestamp iso={d.loadedAt} />
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {d.size?.toLocaleString('en-US') ?? d.version ?? ''}
                  </td>
                  <td className="px-3 py-2">
                    {off ? (
                      <span className="text-[var(--muted)]">
                        Not configured: set MAXMIND_ACCOUNT_ID and MAXMIND_LICENSE_KEY
                      </span>
                    ) : d.lastError ? (
                      <span className="inline-flex items-baseline gap-2">
                        <SeverityTag category="danger" />
                        <span className="text-[var(--danger-fg)]">Error: {d.lastError}</span>
                      </span>
                    ) : d.loading ? (
                      <span className="text-[var(--info-fg)]">Loading</span>
                    ) : d.loadedAt ? (
                      <SeverityTag category="success" />
                    ) : (
                      <span className="text-[var(--warning-fg)]">Not loaded</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="-mt-7 mb-10 max-w-[75ch] text-sm text-[var(--muted)]">
        GeoLite2 is checked for a new release every few hours and downloaded only when MaxMind
        publishes one (usually Tuesdays and Fridays). This product includes GeoLite2 data created by
        MaxMind, available from <a href="https://www.maxmind.com">https://www.maxmind.com</a>.
      </p>

      <SectionHead title="IRR sources" />
      <p className="mb-3 max-w-[75ch] text-sm text-[var(--muted)]">
        IRRs mirrored by <a href="https://irrd.readthedocs.io/en/stable/">IRRd v4</a> and queried
        live. The last update is when IRRd last processed a change for the source, not when it last
        checked, so rarely changing sources can look old. The RPKI source is IRRd&apos;s import of
        validated ROAs, which IRR Explorer uses for every RPKI column and check.
      </p>
      {data.irr ? (
        <div className="mb-10 overflow-x-auto border border-[var(--rule)] bg-[var(--panel)]">
          <table className="w-full border-collapse font-mono text-[0.8rem]">
            <thead className="bg-[var(--sunk)]">
              <tr>
                {['Source', 'Last update', 'Authoritative'].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="label border-b border-[var(--rule-strong)] px-3 py-2 text-left"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.irr.map((s) => (
                <tr key={s.source} className="border-b border-[var(--rule)] last:border-b-0">
                  <td className="px-3 py-2 font-mono">{s.source}</td>
                  <td className="px-3 py-2">
                    <Timestamp iso={s.lastUpdate} />
                  </td>
                  <td className="px-3 py-2">{s.authoritative ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p
          role="alert"
          className="mb-10 border border-[var(--rule-strong)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--danger-fg)]"
        >
          IRRd unavailable: {data.irrError}
        </p>
      )}

      <SectionHead title="Upstream calls" />
      <p className="mb-3 max-w-[75ch] text-sm text-[var(--muted)]">
        The last successful and failed call this server made to each upstream, from real traffic.
      </p>
      <div className="mb-10 overflow-x-auto border border-[var(--rule)] bg-[var(--panel)]">
        <table className="w-full border-collapse font-mono text-[0.8rem]">
          <thead className="bg-[var(--sunk)]">
            <tr>
              {['Upstream', 'Last success', 'Last failure', 'Last error'].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="label border-b border-[var(--rule-strong)] px-3 py-2 text-left"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.health).map(([name, h]) => (
              <tr key={name} className="border-b border-[var(--rule)] last:border-b-0">
                <td className="px-3 py-2">{UPSTREAM_LABEL[name] ?? name}</td>
                <td className="px-3 py-2">
                  <Timestamp iso={h.lastSuccess} />
                </td>
                <td className="px-3 py-2">
                  <Timestamp iso={h.lastFailure} />
                </td>
                <td className="px-3 py-2 text-[var(--muted)]">{h.lastError ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-right">
        <a href="/api/metadata/" className="label">
          Source data as JSON
        </a>
      </p>
    </div>
  )
}
