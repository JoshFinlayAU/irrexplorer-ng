// @vitest-environment jsdom
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { SortingState } from '@tanstack/react-table'
import { PrefixTable } from '~/components/prefix-table'
import { rate } from '~/lib/analysis/report'
import type { PrefixSummary } from '~/lib/analysis/types'
import { renderWithRouter } from '../render'

const rows: PrefixSummary[] = [
  rate({
    prefix: '193.0.0.0/21',
    rir: 'RIPE NCC',
    bgpOrigins: [{ asn: 3333, rpki: { state: 'valid' } }],
    rpkiRoutes: [{ asn: 3333, maxLength: 21 }],
    irrRoutes: { RIPE: [{ asn: 3333, rpslPk: '193.0.0.0/21AS3333', rpki: { state: 'valid' } }] },
  }),
  rate({
    prefix: '10.0.0.0/24',
    rir: null,
    bgpOrigins: [{ asn: 64500, rpki: { state: 'not-found' } }],
    rpkiRoutes: [],
    irrRoutes: {
      RADB: [
        { asn: 64501, rpslPk: '10.0.0.0/24AS64501', rpki: { state: 'invalid', reason: 'as' } },
      ],
    },
  }),
  rate({
    prefix: '9.0.0.0/24',
    rir: 'ARIN',
    bgpOrigins: [],
    rpkiRoutes: [],
    irrRoutes: { RADB: [{ asn: 1, rpslPk: '9.0.0.0/24AS1', rpki: { state: 'not-found' } }] },
  }),
]

function Harness(props: {
  reduced?: boolean
  issuesOnly?: boolean
  filter?: string
  initialSort?: SortingState
}) {
  const [sort, setSort] = useState<SortingState>(
    props.initialSort ?? [{ id: 'prefix', desc: false }],
  )
  const [hidden, setHidden] = useState<string[]>([])
  return (
    <PrefixTable
      id="t"
      title="Test table"
      rows={rows}
      asNames={{ '3333': 'RIPE NCC' }}
      sort={sort}
      onSortChange={setSort}
      hidden={hidden}
      onHiddenChange={setHidden}
      reduced={props.reduced ?? false}
      issuesOnly={props.issuesOnly ?? false}
      filter={props.filter ?? ''}
      jsonHref="/api/x"
    />
  )
}

const prefixes = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[0]!.textContent)

describe('PrefixTable', () => {
  it('sorts prefixes numerically, not as strings', async () => {
    await renderWithRouter(<Harness />)
    expect(prefixes()).toEqual(['9.0.0.0/24', '10.0.0.0/24', '193.0.0.0/21'])
  })

  it('toggles sort direction from the header', async () => {
    const user = userEvent.setup()
    await renderWithRouter(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Prefix' }))
    expect(prefixes()).toEqual(['193.0.0.0/21', '10.0.0.0/24', '9.0.0.0/24'])
    expect(screen.getByRole('columnheader', { name: 'Prefix' })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
  })

  it('sorts advice worst first', async () => {
    await renderWithRouter(<Harness initialSort={[{ id: 'advice', desc: false }]} />)
    expect(prefixes()[0]).toBe('10.0.0.0/24')
  })

  it('has one column per IRR source and no RPKI pseudo-column', async () => {
    await renderWithRouter(<Harness />)
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['Prefix', 'RIR', 'BGP', 'RPKI', 'RADB', 'RIPE', 'Advice'])
  })

  it('shows only errors and warnings when asked', async () => {
    await renderWithRouter(<Harness issuesOnly />)
    // 9.0.0.0/24 is a warning (ARIN space, objects only in RADB); 193.0.0.0/21 is OK.
    expect(prefixes()).toEqual(['9.0.0.0/24', '10.0.0.0/24'])
  })

  it('filters by text, including AS-prefixed ASNs', async () => {
    await renderWithRouter(<Harness filter="AS3333" />)
    expect(prefixes()).toEqual(['193.0.0.0/21'])
    expect(screen.getByText('1 of 3 prefixes shown')).toBeInTheDocument()
  })

  it('adds a status column and drops colour in reduced mode', async () => {
    await renderWithRouter(<Harness reduced />)
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: /Status: Error/ }).length).toBeGreaterThan(0)
  })

  it('marks RPKI state with text, not colour alone', async () => {
    await renderWithRouter(<Harness />)
    expect(screen.getAllByRole('img', { name: 'RPKI valid' }).length).toBeGreaterThan(0)
    const invalid = screen.getByRole('button', {
      name: /64501.*RPKI invalid: no ROA authorises this origin ASN/,
    })
    expect(invalid).toHaveClass('line-through')
    expect(screen.getAllByText('Error:', { exact: false }).length).toBeGreaterThan(0)
  })

  it('shows ROAs with their max length', async () => {
    await renderWithRouter(<Harness />)
    const row = screen.getByRole('row', { name: /193\.0\.0\.0\/21/ })
    const roa = within(row)
      .getAllByRole('listitem')
      .find((li) => li.textContent.includes('/21'))
    expect(roa).toHaveTextContent('3333max length/21')
  })

  it('hides a column from the Columns menu', async () => {
    const user = userEvent.setup()
    await renderWithRouter(<Harness />)
    await user.click(screen.getByText('Columns'))
    await user.click(screen.getByRole('checkbox', { name: 'RIR' }))
    expect(screen.queryByRole('columnheader', { name: 'RIR' })).not.toBeInTheDocument()
  })

  it('links BGP origins to the looking glass', async () => {
    await renderWithRouter(<Harness />)
    const lg = screen.getAllByTitle('Open in the NLNOG RING looking glass')[0]!
    expect(lg).toHaveAttribute('href', expect.stringContaining('lg.ring.nlnog.net/prefix?q='))
  })
})
