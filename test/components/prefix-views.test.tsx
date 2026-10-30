// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { SortingState } from '@tanstack/react-table'
import { PrefixGrid } from '~/components/prefix-table'
import { PrefixRecord } from '~/components/prefix-records'
import { Findings, groupFindings } from '~/components/findings'
import { layoutBars } from '~/components/address-map'
import { rate } from '~/lib/analysis/report'
import { parsePrefix } from '~/lib/ip'
import { filterRows, sortRows, sourcesOf } from '~/lib/report-rows'
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

function Grid(props: { reduced?: boolean; hidden?: string[]; initialSort?: SortingState }) {
  const [sort, setSort] = useState<SortingState>(
    props.initialSort ?? [{ id: 'prefix', desc: false }],
  )
  return (
    <PrefixGrid
      id="t"
      rows={rows}
      asNames={{ '3333': 'RIPE NCC' }}
      sort={sort}
      onSortChange={setSort}
      hidden={props.hidden ?? []}
      reduced={props.reduced ?? false}
      onWhois={() => undefined}
    />
  )
}

const prefixes = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[0]!.textContent)

describe('shared row logic', () => {
  it('sorts numerically, by specificity and by severity', () => {
    expect(sortRows(rows, { id: 'prefix', desc: false }).map((r) => r.prefix)).toEqual([
      '9.0.0.0/24',
      '10.0.0.0/24',
      '193.0.0.0/21',
    ])
    expect(sortRows(rows, { id: 'specific', desc: false })[2]!.prefix).toBe('193.0.0.0/21')
    expect(sortRows(rows, { id: 'advice', desc: false })[0]!.prefix).toBe('10.0.0.0/24')
  })

  it('filters issues only and by text, including AS-prefixed ASNs', () => {
    // 9.0.0.0/24 is a warning (ARIN space, objects only in RADB); 193.0.0.0/21 is OK.
    expect(filterRows(rows, { filter: '', issuesOnly: true }).map((r) => r.prefix)).toEqual([
      '10.0.0.0/24',
      '9.0.0.0/24',
    ])
    expect(filterRows(rows, { filter: 'AS3333', issuesOnly: false }).map((r) => r.prefix)).toEqual([
      '193.0.0.0/21',
    ])
    expect(filterRows(rows, { filter: 'radb', issuesOnly: false })).toHaveLength(2)
  })

  it('lists IRR sources once, sorted', () => {
    expect(sourcesOf(rows)).toEqual(['RADB', 'RIPE'])
  })
})

describe('PrefixGrid (table view)', () => {
  it('sorts prefixes numerically and toggles from the header', async () => {
    const user = userEvent.setup()
    await renderWithRouter(<Grid />)
    expect(prefixes()).toEqual(['9.0.0.0/24', '10.0.0.0/24', '193.0.0.0/21'])
    await user.click(screen.getByRole('button', { name: 'Prefix' }))
    expect(prefixes()).toEqual(['193.0.0.0/21', '10.0.0.0/24', '9.0.0.0/24'])
    expect(screen.getByRole('columnheader', { name: 'Prefix' })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
  })

  it('sorts advice worst first', async () => {
    await renderWithRouter(<Grid initialSort={[{ id: 'advice', desc: false }]} />)
    expect(prefixes()[0]).toBe('10.0.0.0/24')
  })

  it('has one column per IRR source and no RPKI pseudo-column', async () => {
    await renderWithRouter(<Grid />)
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['Prefix', 'RIR', 'BGP', 'RPKI', 'RADB', 'RIPE', 'Advice'])
  })

  it('hides columns', async () => {
    await renderWithRouter(<Grid hidden={['rir']} />)
    expect(screen.queryByRole('columnheader', { name: 'RIR' })).not.toBeInTheDocument()
  })

  it('adds a status column in reduced mode', async () => {
    await renderWithRouter(<Grid reduced />)
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: /Status: Error/ }).length).toBeGreaterThan(0)
  })

  it('marks RPKI state with text, not colour alone', async () => {
    await renderWithRouter(<Grid />)
    expect(screen.getAllByRole('img', { name: 'RPKI valid' }).length).toBeGreaterThan(0)
    const invalid = screen.getByRole('button', {
      name: /64501.*RPKI invalid: no ROA authorises this origin ASN/,
    })
    expect(invalid).toHaveClass('line-through')
    expect(screen.getAllByText('Error', { exact: true }).length).toBeGreaterThan(0)
  })

  it('shows ROAs with their max length and links BGP to the looking glass', async () => {
    await renderWithRouter(<Grid />)
    const row = screen.getByRole('row', { name: /193\.0\.0\.0\/21/ })
    expect(
      within(row)
        .getAllByRole('listitem')
        .some((li) => li.textContent === '3333 /21'),
    ).toBe(true)
    const lg = screen.getAllByTitle('Open in the NLNOG RING looking glass')[0]!
    expect(lg).toHaveAttribute('href', expect.stringContaining('lg.ring.nlnog.net/prefix?q='))
  })
})

describe('PrefixRecord (record view)', () => {
  it('lines every origin up against BGP, ROA and each IRR', async () => {
    const onWhois = vi.fn()
    const user = userEvent.setup()
    await renderWithRouter(
      <PrefixRecord
        row={rows[1]!}
        sources={['RADB', 'RIPE']}
        asNames={{}}
        reduced={false}
        onWhois={onWhois}
      />,
    )
    const table = screen.getByRole('table', { name: 'Origins of 10.0.0.0/24 by source' })
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((h) => h.textContent)
    expect(headers).toEqual(['Origin', 'BGP', 'ROA', 'RADB', 'RIPE'])
    // BGP origin first, then the origin only registered in RADB.
    const origins = within(table)
      .getAllByRole('rowheader')
      .map((h) => h.textContent)
    expect(origins).toEqual(['AS64500', 'AS64501'])
    const button = within(table).getByRole('button', {
      name: /RPKI invalid: no ROA authorises.*Show route object/,
    })
    expect(button).toHaveClass('line-through')
    await user.click(button)
    expect(onWhois).toHaveBeenCalledWith(
      expect.objectContaining({ asn: 64501, source: 'RADB', rpslPk: '10.0.0.0/24AS64501' }),
    )
    expect(screen.getAllByText('Error').length).toBeGreaterThan(0)
  })

  it('shows ROA max length per origin', async () => {
    await renderWithRouter(
      <PrefixRecord
        row={rows[0]!}
        sources={['RIPE']}
        asNames={{}}
        reduced={false}
        onWhois={() => undefined}
      />,
    )
    expect(screen.getByTitle('ROA max length')).toHaveTextContent('max /21')
  })
})

describe('Findings', () => {
  it('groups messages across prefixes, errors first', () => {
    const f = groupFindings(rows)
    expect(f[0]!.category).toBe('danger')
    expect(f.every((x) => x.category !== 'success')).toBe(true)
    expect(f.find((x) => x.text === 'RPKI-invalid route objects found')?.prefixes).toEqual([
      '10.0.0.0/24',
    ])
  })

  it('filters to a finding or a prefix when clicked', async () => {
    const onFilter = vi.fn()
    const user = userEvent.setup()
    render(<Findings rows={rows} reduced={false} scope="x" onFilter={onFilter} />)
    await user.click(screen.getByRole('button', { name: 'RPKI-invalid route objects found' }))
    expect(onFilter).toHaveBeenCalledWith('RPKI-invalid route objects found')
    await user.click(screen.getAllByRole('button', { name: '10.0.0.0/24' })[0]!)
    expect(onFilter).toHaveBeenCalledWith('10.0.0.0/24')
  })

  it('says so when nothing is wrong', () => {
    render(<Findings rows={[rows[0]!]} reduced={false} scope="x" onFilter={() => undefined} />)
    expect(screen.getByText(/no issues on any prefix/)).toBeInTheDocument()
  })
})

describe('address map layout', () => {
  const at = (cidr: string) => ({ ...rows[0]!, prefix: cidr })
  it('nests prefixes into lanes and scales them to the least specific', () => {
    const layout = layoutBars(
      [at('10.0.0.0/16'), at('10.0.0.0/24'), at('10.0.128.0/24'), at('10.0.0.0/25')],
      parsePrefix('10.0.0.0/24')!,
    )!
    expect(layout.root.cidr).toBe('10.0.0.0/16')
    expect(layout.lanes).toBe(3)
    const bar = (c: string) => layout.bars.find((b) => b.prefix.cidr === c)!
    expect(bar('10.0.128.0/24')).toMatchObject({ depth: 1, left: 50 })
    expect(bar('10.0.0.0/25').depth).toBe(2)
    expect(bar('10.0.0.0/24').width).toBeCloseTo(100 / 256, 4)
  })

  it('ignores the other address family', () => {
    expect(layoutBars([at('2001:db8::/32')], parsePrefix('10.0.0.0/8')!)).toBeNull()
  })
})
