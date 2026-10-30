// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SearchForm } from '~/components/search-form'
import { SourceNotices } from '~/components/notices'
import { MessageBadge } from '~/components/status'
import { SetExpansionTable, MemberOfTable } from '~/components/set-tables'
import { SetTree, flatten } from '~/components/set-tree'
import { Timestamp, formatUtc } from '~/components/time'
import type { SetExpansion } from '~/lib/analysis/types'
import { renderWithRouter } from '../render'

describe('SearchForm', () => {
  it('is disabled until something is typed and explains invalid input', async () => {
    const user = userEvent.setup()
    await renderWithRouter(<SearchForm />)
    const button = screen.getByRole('button', { name: 'Search' })
    expect(button).toBeDisabled()
    await user.type(
      screen.getByRole('textbox', { name: 'Prefix, IP, ASN or AS/route-set' }),
      'not valid at all',
    )
    await user.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent('Not recognised')
  })

  it('navigates to the canonical view', async () => {
    const user = userEvent.setup()
    const { router } = await renderWithRouter(<SearchForm />)
    await user.type(screen.getByRole('textbox'), 'as3333')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByText('navigated')
    expect(router.state.location.pathname).toBe('/asn/AS3333')
  })

  it('keeps bare IPs bare and canonicalises prefixes', async () => {
    const user = userEvent.setup()
    const { router } = await renderWithRouter(<SearchForm />)
    await user.type(screen.getByRole('textbox'), '193.0.0.77/21')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByText('navigated')
    expect(router.state.location.pathname).toBe('/prefix/193.0.0.0/21')
  })
})

describe('status display', () => {
  it('badges carry their category as text for screen readers', () => {
    render(
      <MessageBadge
        message={{ category: 'danger', text: 'RPKI origin does not match BGP origin' }}
        reduced={false}
      />,
    )
    expect(screen.getByText('Error')).toHaveClass('sr-only')
  })

  it('source notices use alert for danger and status otherwise', () => {
    render(
      <SourceNotices
        notices={[
          { source: 'irr', level: 'danger', text: 'IRRd unavailable' },
          { source: 'bgp', level: 'warning', text: 'Using RIS' },
        ]}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('IRRd unavailable')
    expect(screen.getByRole('status')).toHaveTextContent('Using RIS')
  })
})

describe('Timestamp', () => {
  it('renders the same fixed UTC text on the server', () => {
    const html = renderToString(<Timestamp iso="2026-10-30T04:05:06Z" />)
    expect(html).toContain('2026-10-30 04:05 UTC')
    expect(html).not.toContain('ago')
    expect(formatUtc('nonsense')).toBe('nonsense')
  })
  it('adds relative time on the client', () => {
    render(<Timestamp iso={new Date(Date.now() - 3.5 * 3600_000).toISOString()} />)
    expect(screen.getByText(/3 hours ago/)).toBeInTheDocument()
  })
  it('says never for missing times', () => {
    render(<Timestamp iso={null} />)
    expect(screen.getByText('never')).toBeInTheDocument()
  })
})

const expansion: SetExpansion = {
  root: 'AS-A',
  category: 'as-set',
  rows: [
    { name: 'AS-A', source: 'RIPE', depth: 1, path: ['AS-A'], loops: [] },
    { name: 'AS-B', source: 'RIPE', depth: 2, path: ['AS-A', 'AS-B'], loops: ['AS-A'] },
  ],
  sets: {
    'AS-A|RIPE': { members: ['AS-B', 'AS-GONE', 'AS64500'], missing: ['AS-GONE'] },
    'AS-B|RIPE': { members: ['AS-A'], missing: [] },
  },
  found: true,
  truncated: true,
  depthReached: 2,
  limit: 1000,
  totalSets: 2,
}

describe('set tables', () => {
  it('shows loops, missing sets and truncation', async () => {
    await renderWithRouter(
      <SetExpansionTable
        expansion={expansion}
        state={{
          layout: 'table',
          sort: [{ id: 'depth', desc: false }],
          filter: '',
          problems: false,
        }}
        onChange={() => undefined}
      />,
    )
    expect(screen.getByText('1 loop detected')).toBeInTheDocument()
    expect(screen.getByText('1 missing member set')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Truncated')
    expect(screen.getByText('not found')).toBeInTheDocument()
    expect(screen.getByText('loop')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'AS64500' })).toHaveAttribute('href', '/asn/AS64500')
    expect(screen.getByText('AS-A > AS-B')).toBeInTheDocument()
  })

  it('draws the tree with loop and missing markers', async () => {
    const user = userEvent.setup()
    await renderWithRouter(<SetTree expansion={expansion} filter="" problems={false} />)
    const tree = screen.getByRole('list', { name: 'Expansion tree of AS-A' })
    expect(within(tree).getByText('not found')).toBeInTheDocument()
    expect(within(tree).getByText('loop')).toBeInTheDocument()
    expect(within(tree).getByRole('link', { name: 'AS64500' })).toHaveAttribute(
      'href',
      '/asn/AS64500',
    )
    await user.click(screen.getByRole('button', { name: 'Collapse AS-A' }))
    expect(within(tree).queryByText('loop')).not.toBeInTheDocument()
  })

  it('flattens every ASN and prefix', () => {
    expect(flatten(expansion)).toEqual({ asns: ['AS64500'], prefixes: [] })
  })

  it('member-of table marks presence per IRR', async () => {
    await renderWithRouter(
      <MemberOfTable
        memberOf={{
          irrsSeen: ['RADB', 'RIPE'],
          setsPerIrr: { RIPE: ['AS-X'], RADB: ['AS-X', 'AS-Y'] },
        }}
        objectClass="as-set"
        title="Included in the following AS sets:"
        jsonHref="/api/x"
      />,
    )
    expect(screen.getAllByTitle(/Present in/)).toHaveLength(3)
    const y = screen.getByRole('link', { name: 'AS-Y' }).closest('li')!
    expect(y).toHaveTextContent('AS-YRADB')
  })
})
