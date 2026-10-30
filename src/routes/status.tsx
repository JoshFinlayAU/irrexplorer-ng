import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Pending } from '~/components/route-states'
import { badgeClass } from '~/components/status'
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
}

function StatusPage() {
  const { data } = useSuspenseQuery(statusQuery())
  return (
    <div className="max-w-4xl">
      <h1 className="mb-2 text-2xl font-semibold">Data status</h1>
      <p className="mb-6 text-[var(--muted)]">
        This page shows the last update times for all IRR Explorer data sources.
      </p>

      <h2 className="mb-2 text-lg font-semibold">Bulk datasets</h2>
      <p className="mb-2 text-sm text-[var(--muted)]">
        Downloaded on a schedule and held in memory. The time is when IRR Explorer last loaded the
        data, not when the source published it.
      </p>
      <div className="surface mb-8 overflow-x-auto rounded-md">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-[var(--surface-2)]">
            <tr>
              {['Source', 'Last update', 'Rows', 'State'].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="border-b border-[var(--border)] px-3 py-2 text-left font-semibold"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.datasets.map((d) => {
              const info = DATASET_INFO[d.name]
              return (
                <tr key={d.name} className="border-b border-[var(--border)] last:border-b-0">
                  <td className="px-3 py-2">
                    {info ? <a href={info.href}>{info.label}</a> : d.name}
                  </td>
                  <td className="px-3 py-2">
                    <Timestamp iso={d.loadedAt} />
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {d.size?.toLocaleString('en-US') ?? ''}
                  </td>
                  <td className="px-3 py-2">
                    {d.lastError ? (
                      <span className={`rounded px-1.5 py-0.5 ${badgeClass.danger}`}>
                        Error: {d.lastError}
                      </span>
                    ) : d.loading ? (
                      <span className={`rounded px-1.5 py-0.5 ${badgeClass.info}`}>Loading</span>
                    ) : d.loadedAt ? (
                      <span className={`rounded px-1.5 py-0.5 ${badgeClass.success}`}>OK</span>
                    ) : (
                      <span className={`rounded px-1.5 py-0.5 ${badgeClass.warning}`}>
                        Not loaded
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-lg font-semibold">IRR sources</h2>
      <p className="mb-2 text-sm text-[var(--muted)]">
        IRRs mirrored by <a href="https://irrd.readthedocs.io/en/stable/">IRRd v4</a> and queried
        live. The last update is when IRRd last processed a change for the source, not when it last
        checked, so rarely changing sources can look old. The RPKI source is IRRd&apos;s import of
        validated ROAs, which IRR Explorer uses for every RPKI column and check.
      </p>
      {data.irr ? (
        <div className="surface mb-8 overflow-x-auto rounded-md">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-[var(--surface-2)]">
              <tr>
                {['Source', 'Last update', 'Authoritative'].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="border-b border-[var(--border)] px-3 py-2 text-left font-semibold"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.irr.map((s) => (
                <tr key={s.source} className="border-b border-[var(--border)] last:border-b-0">
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
        <p role="alert" className={`mb-8 rounded-md px-3 py-2 text-sm ${badgeClass.danger}`}>
          IRRd unavailable: {data.irrError}
        </p>
      )}

      <h2 className="mb-2 text-lg font-semibold">Upstream calls</h2>
      <p className="mb-2 text-sm text-[var(--muted)]">
        The last successful and failed call this server made to each upstream, from real traffic.
      </p>
      <div className="surface mb-8 overflow-x-auto rounded-md">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-[var(--surface-2)]">
            <tr>
              {['Upstream', 'Last success', 'Last failure', 'Last error'].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="border-b border-[var(--border)] px-3 py-2 text-left font-semibold"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.health).map(([name, h]) => (
              <tr key={name} className="border-b border-[var(--border)] last:border-b-0">
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
      <p className="text-right text-xs">
        <a href="/api/metadata/">Source data as JSON</a>
      </p>
    </div>
  )
}
