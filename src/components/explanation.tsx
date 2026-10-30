import { InvalidIcon, UnknownIcon, ValidIcon } from './icons'

const MESSAGES: [string, string][] = [
  [
    'Route objects exist, but prefix not seen in DFZ',
    'There are route objects for this prefix, but it is not announced. If the objects are no longer used, clean them up. If the prefix will be announced later this is harmless.',
  ],
  [
    'RPKI ROA exists, but prefix not seen in DFZ',
    'A ROA covers exactly this prefix but it is not announced. Harmless if the announcement is planned.',
  ],
  [
    'Expected route object in <IRR>, but only found in other IRRs',
    'Route objects exist, but not in the IRR of the RIR that manages this space. Add a route object to the RIR database, which is usually the most trusted source.',
  ],
  [
    'No route objects match DFZ origin',
    'None of the origins seen in BGP have a route object. This can have a significant impact on reachability, as many networks filter on IRR data. Create route objects for the announced origin.',
  ],
  [
    'No route objects for some DFZ origins',
    'Some, but not all, origins seen in BGP have a matching route object. Create route objects for the missing origins.',
  ],
  [
    'Expected route object in <IRR>, but BGP origin does not match. Objects from other IRRs do match BGP origin',
    'The RIR database has a route object with a different origin, while another IRR matches BGP. Update or add the route object in the RIR database.',
  ],
  [
    'Expected route object in <IRR> matches BGP origin, but non-matching objects exist in other IRRs',
    'The RIR database is correct, but stale objects with other origins exist elsewhere. Consider cleaning these up.',
  ],
  [
    'Multiple route objects exist with different origins, but DFZ only has one',
    'Several origins are registered but only one is announced. Old objects may be left over.',
  ],
  [
    'RPKI origin does not match BGP origin',
    'A ROA exists for this prefix but does not authorise the origin seen in BGP. Anyone dropping RPKI-invalid routes, which is most of the Internet, will not reach this prefix. Create the right ROAs.',
  ],
  [
    'RPKI-invalid route objects found',
    'At least one route object conflicts with the ROAs for this space. Either the ROA or the route object is misconfigured or outdated.',
  ],
  [
    'No (covering) RPKI ROA found for route objects',
    'None of the route objects are covered by a ROA. A less specific ROA with a suitable max length also counts as covering.',
  ],
  [
    'Overlaps with <name> special use prefix <prefix>',
    'The prefix overlaps reserved or special-use address space, which should normally never appear in the global routing table.',
  ],
  [
    'Everything looks good',
    'No issues were found with the BGP, IRR and RPKI data for this prefix.',
  ],
  [
    'Some checks were skipped because <source> data is unavailable',
    'One of the data sources could not be reached, so checks that depend on it were not run. This page does not claim everything is fine in that case.',
  ],
]

export function Explanation() {
  return (
    <div className="mb-8 grid items-start gap-3 text-sm md:grid-cols-2">
      <details className="border border-[var(--rule)] bg-[var(--panel)] open:md:col-span-2">
        <summary className="label cursor-pointer px-3 py-2 hover:text-[var(--text)]">
          What does the prefix table show?
        </summary>
        <div className="flex flex-col gap-2 border-t border-[var(--rule)] px-4 py-3 leading-relaxed">
          <p>
            The table with prefixes shows prefixes relating to your query. In some cases, there
            might be two tables: one with direct overlaps of your query, and a second with all
            overlaps of the least specific prefix found in the first table.
          </p>
          <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[10rem_1fr]">
            <dt className="font-mono text-[0.8rem] font-medium">Prefix</dt>
            <dd>The prefix found in either BGP, RPKI or IRR.</dd>
            <dt className="font-mono text-[0.8rem] font-medium">RIR</dt>
            <dd>The RIR (or NIR) that allocated or assigned this prefix.</dd>
            <dt className="font-mono text-[0.8rem] font-medium">BGP</dt>
            <dd>
              The originating AS number(s) seen in the DFZ for this prefix, with the RPKI status of
              each origin. Links to the NLNOG RING looking glass.
            </dd>
            <dt className="font-mono text-[0.8rem] font-medium">RPKI</dt>
            <dd>
              ASNs seen in RPKI ROAs for this exact prefix, along with the maximum prefix length in
              the ROA.
            </dd>
            <dt className="font-mono text-[0.8rem] font-medium">Each IRR</dt>
            <dd>
              The originating AS number(s) seen in route(6) objects in that IRR database. Select one
              to see the object. <ValidIcon className="inline text-[var(--success-fg)]" /> means
              RPKI valid, <InvalidIcon className="inline text-[var(--danger-fg)]" /> (struck
              through) means RPKI invalid, <UnknownIcon className="inline text-[var(--muted)]" />{' '}
              means the RPKI status could not be checked, and no icon means no covering ROA (not
              found).
            </dd>
            <dt className="font-mono text-[0.8rem] font-medium">Advice</dt>
            <dd>
              Information, warnings, and alerts about this prefix and its BGP, IRR and RPKI status.
              IRR Explorer makes a best effort at identifying possible misconfigurations, but do
              note that there are unusual setups that may raise false alarms.
            </dd>
          </dl>
          <p>
            An origin can have an RPKI status even without a ROA for that exact prefix. For example,
            with a ROA for 192.0.2.0/22 AS65540 max length 24 and a route object for 192.0.2.0/24
            AS65540, the /24 row has no entry in the RPKI column, but the IRR origin is RPKI valid
            through the covering ROA.
          </p>
        </div>
      </details>
      <details className="border border-[var(--rule)] bg-[var(--panel)] open:md:col-span-2">
        <summary className="label cursor-pointer px-3 py-2 hover:text-[var(--text)]">
          Explanation of different messages
        </summary>
        <div className="border-t border-[var(--rule)] px-4 py-3 leading-relaxed">
          <dl className="flex flex-col gap-2">
            {MESSAGES.map(([title, body]) => (
              <div key={title}>
                <dt className="font-mono text-[0.8rem] font-medium">{title}</dt>
                <dd className="text-[var(--muted)]">{body}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3">
            For more background on securing routing with RPKI and IRR, see{' '}
            <a href="https://rpki.readthedocs.io/en/latest/rpki/securing-bgp.html">
              this very extensive guide
            </a>
            .
          </p>
        </div>
      </details>
    </div>
  )
}
