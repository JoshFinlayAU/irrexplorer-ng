import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { rpslObjectQuery } from '~/lib/queries'
import type { RpkiValidity } from '~/lib/analysis/types'
import { describeValidity } from '~/lib/analysis/rpki'
import { ExternalIcon } from './icons'

export interface WhoisTarget {
  prefix: string
  asn: number
  source: string
  rpslPk: string
  rpki: RpkiValidity
}

const WHOIS_SERVERS: Record<string, string> = {
  AFRINIC: 'whois.afrinic.net',
  ALTDB: 'whois.altdb.net',
  AOLTW: 'whois.aoltw.net',
  APNIC: 'whois.apnic.net',
  ARIN: 'rr.arin.net',
  BELL: 'whois.in.bell.ca',
  BBOI: 'irr.bboi.net',
  CANARIE: 'whois.canarie.ca',
  EPOCH: 'whois.epoch.net',
  HOST: 'rr.host.net',
  IDNIC: 'irr.idnic.net',
  JPIRR: 'jpirr.nic.ad.jp',
  LACNIC: 'irr.lacnic.net',
  LEVEL3: 'rr.Level3.net',
  NESTEGG: 'whois.nestegg.net',
  NTTCOM: 'rr.ntt.net',
  OPENFACE: 'whois.openface.ca',
  PANIX: 'rrdb.access.net',
  RADB: 'whois.radb.net',
  REACH: 'rr.telstraglobal.net',
  RGNET: 'whois.rg.net',
  RIPE: 'whois.ripe.net',
  'RIPE-NONAUTH': 'whois.ripe.net',
  TC: 'whois.bgp.net.br',
}

const WEB_URLS: Record<string, (key: string) => string> = {
  AFRINIC: (k) =>
    `https://afrinic.net/whois-web/public/plain-text?sourceDatabases=AFRINIC&id=${k}&type=route,route6`,
  IDNIC: (k) => `https://idnic.net/service/whois/search?key=${k}`,
  LACNIC: (k) => `https://query.milacnic.lacnic.net/search?id=${k}`,
  RIPE: (k) => `https://apps.db.ripe.net/db-web-ui/query?searchtext=${k}`,
  RADB: (k) => `https://www.radb.net/query?keywords=${k}`,
  TC: (k) => `https://bgp.net.br/whois.html?q=${k}`,
}

export function whoisCommand(source: string, prefix: string): string | null {
  const server = WHOIS_SERVERS[source]
  return server ? `whois -h ${server} ${prefix}` : null
}

export function webUrl(source: string, prefix: string, asn: number): string | null {
  const build = WEB_URLS[source]
  return build ? build(encodeURIComponent(`${prefix}AS${asn}`)) : null
}

export function WhoisDialog({ target, onClose }: { target: WhoisTarget; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const objectClass = target.prefix.includes(':') ? 'route6' : 'route'
  const query = useQuery(rpslObjectQuery(target.rpslPk, target.source, objectClass))

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const command = whoisCommand(target.source, target.prefix)
  const url = webUrl(target.source, target.prefix, target.asn)
  const title = `AS${target.asn} / ${target.prefix}`

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="whois-title"
      className="m-auto w-[min(52rem,calc(100vw-2rem))] border border-[var(--rule-strong)] bg-[var(--panel)] p-0 text-[var(--text)] backdrop:bg-black/60"
    >
      <div className="flex items-center justify-between gap-4 border-b border-[var(--rule)] px-4 py-2.5">
        <h2
          id="whois-title"
          className="flex items-baseline gap-3 font-mono text-[0.95rem] font-semibold"
        >
          <span className="label">{target.source}</span> {title}
        </h2>
        <button type="button" onClick={() => ref.current?.close()} className="control">
          Close
        </button>
      </div>
      <div className="flex flex-col gap-3 px-4 py-4 text-[0.88rem]">
        <p>
          Route object in <strong>{target.source}</strong>. {describeValidity(target.rpki)}.
        </p>
        {target.rpki.state === 'invalid' ? (
          <p
            role="alert"
            className="border-l-[3px] border-[var(--warning-fg)] bg-[var(--warning-tint)] px-3 py-2 text-[var(--warning-fg)]"
          >
            This route object is RPKI-invalid, and may be filtered out of whois query output by
            default.
          </p>
        ) : null}
        {command ? (
          <code className="block border border-[var(--rule)] bg-[var(--sunk)] px-3 py-1.5 font-mono text-[0.8rem]">
            <span aria-hidden="true" className="text-[var(--faint)]">
              ${' '}
            </span>
            {command}
          </code>
        ) : null}
        {query.isPending ? (
          <p role="status" className="font-mono text-[0.8rem] text-[var(--muted)]">
            Loading object_
          </p>
        ) : query.data?.ok === false ? (
          <p
            role="alert"
            className="border-l-[3px] border-[var(--danger-fg)] bg-[var(--danger-tint)] px-3 py-2 text-[var(--danger-fg)]"
          >
            Could not load the object from IRRd: {query.data.error}
          </p>
        ) : query.data?.ok && query.data.text ? (
          <pre
            tabIndex={0}
            aria-label="RPSL object text"
            className="max-h-[50vh] overflow-auto border border-[var(--rule)] bg-[var(--bg)] p-3 font-mono text-[0.78rem] leading-relaxed"
          >
            {query.data.text}
          </pre>
        ) : (
          <p>The object was not found in IRRd. It may have been deleted since this page loaded.</p>
        )}
        <p className="text-[var(--muted)]">
          The object shown is mirrored, and may be modified or slightly outdated. You can get the
          latest version directly from the IRR registry.
        </p>
        {url ? (
          <p>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1"
            >
              Open this object on the {target.source} website <ExternalIcon />
            </a>
          </p>
        ) : null}
      </div>
    </dialog>
  )
}
