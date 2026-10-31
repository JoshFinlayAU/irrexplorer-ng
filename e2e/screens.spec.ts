// Every screen, loaded directly (SSR deep link) and reached by client-side
// navigation, checked for content parity, console cleanliness (including
// hydration warnings) and accessibility in light and dark themes.
import { checkA11y, expect, hydrated, search, setTheme, shot, test } from './helpers'
import type { Page } from '@playwright/test'

async function themes(page: Page, name: string) {
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme)
    await checkA11y(page)
    await shot(page, `${name}-${theme}`)
  }
}

const table = (page: Page, title: RegExp) =>
  page.getByRole('region', { name: title }).getByRole('table')

/** One prefix record (record view) inside a report section. */
const record = (page: Page, section: RegExp, prefix: string) =>
  page.getByRole('region', { name: section }).getByRole('article', { name: prefix, exact: true })

test.describe('home', () => {
  test('renders the search start page', async ({ page }) => {
    await page.goto('/')
    await hydrated(page)
    await expect(page).toHaveTitle('IRR Explorer NG')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('IRR Explorer NG')
    await expect(
      page.getByText('IRR Explorer shows the routing, IRR and RPKI status'),
    ).toBeVisible()
    await expect(
      page.getByText('Enter a prefix, IP address, AS number or AS/route set name.'),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'Search' })).toBeDisabled()
    await expect(page.getByRole('link', { name: 'Data source status' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Synopsis' })).toBeVisible()
    // Sources panel loads on the client.
    await expect(page.getByRole('table', { name: 'Data source freshness' })).toContainText(
      'bgp.tools table',
    )
    await themes(page, 'home')
  })

  test('slash focuses the command bar, and visited reports show as recent', async ({
    page,
    isMobile,
  }) => {
    await page.goto('/prefix/193.0.0.0/21')
    await hydrated(page)
    await page.keyboard.press('/')
    await expect(
      page.getByRole('textbox', { name: 'Prefix, IP, ASN or AS/route-set' }),
    ).toBeFocused()
    await page.keyboard.type('AS3333')
    // The live classification hint only fits on wider screens.
    if (!isMobile) await expect(page.getByText('asn', { exact: true })).toBeVisible()
    await page.goto('/')
    await hydrated(page)
    await expect(
      page.getByRole('region', { name: 'Recent' }).getByRole('link', { name: '193.0.0.0/21' }),
    ).toBeVisible()
  })

  test('rejects invalid input with an explanation', async ({ page }) => {
    await page.goto('/')
    await hydrated(page)
    await search(page, 'hello world')
    await expect(page.getByRole('alert')).toContainText('Not recognised')
    await expect(page).toHaveURL('/')
  })

  test('theme toggle switches and persists', async ({ page }) => {
    await page.goto('/')
    await hydrated(page)
    const html = page.locator('html')
    const before = (await html.getAttribute('class'))?.includes('dark') ?? false
    await page.getByRole('button', { name: 'Toggle dark mode' }).click()
    await expect(html).toHaveClass(before ? /^(?!.*dark)/ : /dark/)
    await page.reload()
    await expect(html).toHaveClass(before ? /^(?!.*dark)/ : /dark/)
  })
})

test.describe('prefix view', () => {
  test('193.0.0.0/21 deep link: all good, every column present', async ({ page }) => {
    await page.goto('/prefix/193.0.0.0/21')
    await hydrated(page)
    await expect(page).toHaveTitle('IRR Explorer NG: 193.0.0.0/21')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Report for prefix 193.0.0.0/21',
    )
    const rec = record(page, /Directly overlapping prefixes of 193\.0\.0\.0\/21/, '193.0.0.0/21')
    await expect(rec).toContainText('RIPE NCC')
    for (const col of ['Origin', 'BGP', 'ROA', 'RIPE']) {
      await expect(rec.getByRole('columnheader', { name: col, exact: true })).toBeVisible()
    }
    await expect(rec.getByRole('rowheader', { name: 'AS3333' })).toBeVisible()
    await expect(rec.getByTitle('ROA max length')).toHaveText('max /21')
    await expect(rec).toContainText('Everything looks good')
    await expect(page.getByRole('region', { name: 'Findings' })).toContainText('no issues')
    // The same data in the table view, with every original column.
    await page.getByRole('button', { name: 'Table', exact: true }).click()
    await expect(page).toHaveURL(/view=table/)
    const t = table(page, /Directly overlapping prefixes of 193\.0\.0\.0\/21/)
    for (const col of ['Prefix', 'RIR', 'BGP', 'RPKI', 'RIPE', 'Advice']) {
      await expect(t.getByRole('columnheader', { name: col, exact: true })).toBeVisible()
    }
    const row = t.getByRole('row').filter({ hasText: '193.0.0.0/21' })
    await expect(row.getByRole('listitem').filter({ hasText: '/21' })).toHaveText(/3333.*\/21/)
    await expect(page.getByText(/Seen by \d+ of \d+ RIPE RIS full-feed peers/)).toBeVisible()
    // GeoLite2 (the generated stand-in): a quarter of the /21 is in Germany.
    const location = page
      .getByLabel('Prefix facts')
      .getByRole('definition')
      .filter({ hasText: 'NL' })
    await expect(location).toContainText('NL 75%')
    await expect(location).toContainText('DE 25%')
    await expect(t.getByRole('columnheader', { name: 'Geo', exact: true })).toBeVisible()
    await expect(row.getByTitle(/GeoLite2 location: Netherlands 75%, Germany 25%/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Source data as JSON' }).first()).toHaveAttribute(
      'href',
      '/api/prefixes/prefix/193.0.0.0/21',
    )
    await themes(page, 'prefix-193.0.0.0_21')
  })

  test('reached by client-side search', async ({ page }) => {
    await page.goto('/')
    await hydrated(page)
    await search(page, '193.0.0.0/21')
    await expect(page).toHaveURL('/prefix/193.0.0.0/21')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Report for prefix 193.0.0.0/21',
    )
  })

  test('canonicalises host bits in the URL', async ({ page }) => {
    await page.goto('/prefix/193.0.0.77/21')
    await expect(page).toHaveURL('/prefix/193.0.0.0/21')
  })

  test('IPv6 prefix', async ({ page }) => {
    await page.goto('/prefix/2001:67c:2e8::/48')
    await hydrated(page)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Report for prefix 2001:67c:2e8::/48',
    )
    await expect(record(page, /Directly overlapping prefixes/, '2001:67c:2e8::/48')).toContainText(
      'AS3333',
    )
    await themes(page, 'prefix-v6')
  })

  test('bare IP shows the covering announced prefix and least specific table', async ({ page }) => {
    await page.goto('/prefix/193.0.0.1')
    await hydrated(page)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Report for prefix 193.0.0.1')
    const facts = page.getByRole('definition').filter({ hasText: '193.0.0.0/21' })
    await expect(page.getByText('Covering route', { exact: true })).toBeVisible()
    await expect(facts.getByRole('link', { name: '193.0.0.0/21' })).toBeVisible()
    const location = page
      .getByLabel('Prefix facts')
      .getByRole('definition')
      .filter({ hasText: 'Amsterdam' })
    await expect(location).toContainText('Amsterdam, North Holland, Netherlands')
    await expect(location).toContainText('±20 km')
    await expect(location.getByRole('link', { name: /52\.3759, 4\.8975/ })).toHaveAttribute(
      'href',
      /openstreetmap\.org\/\?mlat=52\.3759&mlon=4\.8975/,
    )
    await expect(
      page.getByRole('heading', { name: /All overlaps of least specific match/ }),
    ).toBeVisible()
    await themes(page, 'prefix-host')
  })

  test('8.8.8.0/24: expected IRR warning, least specific table, filters', async ({ page }) => {
    await page.goto('/prefix/8.8.8.0/24')
    await hydrated(page)
    const rec = record(page, /Directly overlapping prefixes of 8\.8\.8\.0\/24/, '8.8.8.0/24')
    await expect(rec).toContainText('ARIN')
    await expect(rec).toContainText('Expected route object in ARIN, but only found in other IRRs')
    await expect(rec.getByRole('columnheader', { name: 'RADB', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Findings' })).toContainText(
      'Expected route object in ARIN',
    )
    await expect(
      page.getByRole('heading', { name: 'All overlaps of least specific match 8.0.0.0/9' }),
    ).toBeVisible()

    // Errors + warnings hides OK and info-only rows, and lives in the URL.
    await page.getByRole('button', { name: 'Errors + warnings' }).click()
    await expect(page).toHaveURL(/issues=true/)
    // Reduced colour mode adds the status column to the table view.
    await page.getByLabel('Reduced colour').check()
    await expect(page).toHaveURL(/reduced=true/)
    await page.getByRole('button', { name: 'Table', exact: true }).click()
    const t1 = table(page, /Directly overlapping prefixes of 8\.8\.8\.0\/24/)
    await expect(t1.getByRole('columnheader', { name: 'Status' })).toHaveCount(1)
    // Text filter.
    await page.getByLabel('Filter', { exact: true }).fill('15169')
    await expect(t1.getByRole('row')).toHaveCount(2)
    await page.reload()
    await hydrated(page)
    await expect(page.getByLabel('Filter', { exact: true })).toHaveValue('15169')
    await themes(page, 'prefix-8.8.8.0_24-filtered')
  })

  test('record order is shareable', async ({ page }) => {
    await page.goto('/prefix/8.8.8.0/24')
    await hydrated(page)
    const region = page.getByRole('region', { name: /All overlaps of least specific/ })
    await region.getByRole('button', { name: 'Address' }).click()
    await expect(page).toHaveURL(/sort2=prefix/)
    await expect(region.getByRole('article').first()).toHaveAccessibleName('8.0.0.0/9')
  })

  test('sorting by column toggles direction and is shareable', async ({ page }) => {
    await page.goto('/prefix/8.8.8.0/24?view=table')
    await hydrated(page)
    const t1 = table(page, /Directly overlapping prefixes/)
    await t1.getByRole('button', { name: 'BGP' }).click()
    await expect(page).toHaveURL(/sort=bgp/)
    await expect(t1.getByRole('columnheader', { name: 'BGP' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    await t1.getByRole('button', { name: 'BGP' }).click()
    await expect(page).toHaveURL(/sort=-bgp/)
    await expect(t1.getByRole('columnheader', { name: 'BGP' })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    const first = t1.getByRole('row').nth(1)
    await expect(first).toContainText('15169')
  })

  test('column visibility can hide a column', async ({ page }) => {
    await page.goto('/prefix/193.0.0.0/21?view=table')
    await hydrated(page)
    const region = page.getByRole('region', { name: /Directly overlapping/ })
    await page.getByText('Columns', { exact: true }).click()
    await page.getByRole('checkbox', { name: 'RIR' }).uncheck()
    await expect(page).toHaveURL(/hide=/)
    await expect(region.getByRole('columnheader', { name: 'RIR', exact: true })).toHaveCount(0)
  })

  test('RPKI-invalid route object is struck through and flagged', async ({ page }) => {
    await page.goto('/prefix/137.17.80.0/24')
    await hydrated(page)
    const rec = record(page, /Directly overlapping/, '137.17.80.0/24')
    await expect(rec).toContainText('RPKI-invalid route objects found')
    await expect(rec.locator('button.line-through').first()).toBeVisible()
    await expect(rec).toContainText('invalid len')
    // Used in Australia but registered to the US, as GeoLite2 reports it.
    await expect(page.getByLabel('Prefix facts')).toContainText(
      'Sydney, New South Wales, Australia',
    )
    await expect(page.getByLabel('Prefix facts')).toContainText('registered US')
    await expect(page.getByRole('region', { name: 'Address space' })).toContainText(
      'inside 137.17.0.0/16',
    )
    await themes(page, 'prefix-rpki-invalid')
  })

  test('special use space is flagged', async ({ page }) => {
    await page.goto('/prefix/10.10.0.0/16')
    await hydrated(page)
    await expect(
      page.getByText('Overlaps with RFC1918 special use prefix 10.0.0.0/8').first(),
    ).toBeVisible()
    await checkA11y(page)
  })

  test('large ranges are refused like the original', async ({ page }) => {
    await page.goto('/prefix/8.0.0.0/8')
    await hydrated(page)
    await expect(page.getByRole('alert')).toHaveText(
      'Query too large: the minimum prefix length is 9.',
    )
    await themes(page, 'prefix-too-large')
  })

  test('large table virtualises and still shows every row on scroll', async ({ page }) => {
    await page.goto('/prefix/8.0.0.0/12')
    await hydrated(page)
    const region = page.getByRole('region', { name: /Directly overlapping/ })
    await expect(region.getByText(/^\d+ prefixes$/)).toBeVisible()
    const count = Number((await region.getByText(/^\d+ prefixes$/).textContent())?.split(' ')[0])
    expect(count).toBeGreaterThan(250)
    const rendered = await region.locator('[data-index]').count()
    expect(rendered).toBeLessThan(count)
    // Records are measured as they render, so the page grows; keep scrolling until it settles.
    const last = region.locator(`[data-index="${count - 1}"]`)
    await expect(async () => {
      await region.evaluate((el) => {
        const r = el.getBoundingClientRect()
        window.scrollTo(0, window.scrollY + r.bottom - window.innerHeight + 10)
      })
      await expect(last).toBeInViewport({ timeout: 500 })
    }).toPass({ timeout: 30_000 })
  })

  test('table header stays visible while scrolling on desktop', async ({ page, isMobile }) => {
    test.skip(isMobile, 'tables scroll sideways on small screens instead')
    await page.goto('/prefix/8.0.0.0/12?view=table')
    await hydrated(page)
    const region = page.getByRole('region', { name: /Directly overlapping/ })
    // Wheel step sizes differ per browser, so set the position directly.
    await page.evaluate(() => window.scrollTo(0, 3000))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(2000)
    // The first rows have scrolled away but the header is pinned to the top.
    await expect(region.locator('tbody tr[data-index="0"]')).not.toBeInViewport()
    await expect(region.getByRole('columnheader', { name: 'Advice' })).toBeInViewport()
  })

  test('invalid prefix shows an error', async ({ page }) => {
    await page.goto('/prefix/300.1.1.1/24')
    await hydrated(page)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not a valid prefix')
    await page.goto('/prefix/100%25')
    await hydrated(page)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not a valid prefix')
    await themes(page, 'prefix-invalid')
  })

  test('whois dialog shows the route object', async ({ page }) => {
    await page.goto('/prefix/193.0.0.0/21')
    await hydrated(page)
    const rec = record(page, /Directly overlapping/, '193.0.0.0/21')
    await rec.getByRole('button', { name: /Show route object/ }).click()
    const dialog = page.getByRole('dialog', { name: 'RIPE AS3333 / 193.0.0.0/21' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('whois -h whois.ripe.net 193.0.0.0/21')).toBeVisible()
    await expect(dialog.locator('pre')).toContainText('route:')
    await expect(
      dialog.getByRole('link', { name: /Open this object on the RIPE website/ }),
    ).toHaveAttribute('href', /apps\.db\.ripe\.net/)
    await checkA11y(page)
    await shot(page, 'whois-dialog')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('explanation panels expand', async ({ page }) => {
    await page.goto('/prefix/193.0.0.0/21')
    await hydrated(page)
    await page.getByText('Explanation of different messages').click()
    await expect(page.getByText('No route objects match DFZ origin', { exact: true })).toBeVisible()
    await page.getByText('What does the prefix table show?').click()
    await expect(page.getByText('The prefix found in either BGP, RPKI or IRR.')).toBeVisible()
  })
})

test.describe('ASN view', () => {
  test('AS3333 deep link with both tables and set membership', async ({ page }) => {
    await page.goto('/asn/AS3333')
    await hydrated(page)
    await expect(page).toHaveTitle('IRR Explorer NG: AS3333')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Report for ASN AS3333')
    await expect(page.getByText(/RIPE NCC/).first()).toBeVisible()
    await expect(record(page, /Prefixes originated by AS3333/, '193.0.0.0/21')).toContainText(
      'Everything looks good',
    )
    await expect(page.getByLabel('ASN facts')).toContainText('Announced')
    await expect(page.getByLabel('ASN facts')).toContainText('Announced from')
    await expect(page.getByLabel('ASN facts')).toContainText(/NL \d+%/)
    await expect(
      page.getByRole('heading', {
        name: 'Other prefixes overlapping with prefixes originated by AS3333',
      }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Included in the following AS sets:' }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Included in the following route sets:' }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'AS-RIPENCC' })).toBeVisible()
    await themes(page, 'asn-AS3333')
  })

  test('lower-case and bare ASNs redirect to the canonical URL', async ({ page }) => {
    await page.goto('/asn/as3333')
    await expect(page).toHaveURL('/asn/AS3333')
    await page.goto('/asn/3333')
    await expect(page).toHaveURL('/asn/AS3333')
  })

  test('reached by client-side search', async ({ page }) => {
    await page.goto('/')
    await hydrated(page)
    await search(page, 'as3333')
    await expect(page).toHaveURL('/asn/AS3333')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Report for ASN AS3333')
  })

  test('large ASN (AS1136) virtualises and shows RPKI-invalid objects', async ({ page }) => {
    await page.goto('/asn/AS1136')
    await hydrated(page)
    const region = page.getByRole('region', { name: /Prefixes originated by AS1136/ })
    const count = Number((await region.getByText(/^\d+ prefixes$/).textContent())?.split(' ')[0])
    expect(count).toBeGreaterThan(250)
    await page.getByLabel('Filter', { exact: true }).fill('RPKI-invalid')
    await expect(region.getByText('RPKI-invalid route objects found').first()).toBeVisible()
    await themes(page, 'asn-AS1136-filtered')
  })

  test('out of range ASN shows an error', async ({ page }) => {
    await page.goto('/asn/AS4294967296')
    await hydrated(page)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not a valid AS number')
  })
})

test.describe('set views', () => {
  test('AS-RIPENCC expansion and member-of', async ({ page }) => {
    await page.goto('/as-set/AS-RIPENCC')
    await hydrated(page)
    await expect(page).toHaveTitle('IRR Explorer NG: AS-RIPENCC')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Report for as-set AS-RIPENCC')
    const region = page.getByRole('region', { name: 'Expands to:' })
    const tree = region.getByRole('list', { name: 'Expansion tree of AS-RIPENCC' })
    await expect(tree.getByRole('link', { name: 'AS3333' })).toHaveAttribute('href', '/asn/AS3333')
    await expect(page.getByRole('region', { name: 'Flattened members' })).toContainText('AS3333')
    // The original path table is one click away.
    await region.getByRole('button', { name: 'Paths' }).click()
    await expect(page).toHaveURL(/layout=table/)
    const t = region.getByRole('table')
    for (const col of ['Name', 'Source', 'Depth', 'Path', 'Members']) {
      await expect(t.getByRole('columnheader', { name: col })).toBeVisible()
    }
    await expect(t.getByRole('row').nth(1)).toContainText('AS3333')
    await expect(
      page.getByText('Expansion depth is limited beyond 50 total as-sets.'),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Included in the following sets:' }),
    ).toBeVisible()
    await themes(page, 'as-set-AS-RIPENCC')
  })

  test('AS-BIT flags loops and missing member sets', async ({ page }) => {
    await page.goto('/as-set/AS-BIT')
    await hydrated(page)
    const facts = page.getByLabel('Expansion facts')
    await expect(facts).toContainText(/Loops\s*[1-9]/)
    await expect(facts).toContainText(/Missing sets\s*[1-9]/)
    await page.getByRole('button', { name: 'Loops + missing' }).click()
    await expect(page).toHaveURL(/problems=true/)
    const tree = page.getByRole('list', { name: 'Expansion tree of AS-BIT' })
    await expect(tree.getByText('loop', { exact: true }).first()).toBeVisible()
    await expect(tree.getByText('not found', { exact: true }).first()).toBeVisible()
    await themes(page, 'as-set-AS-BIT-problems')
  })

  test('AS-COLOCLUE is truncated at the configured limit', async ({ page }) => {
    await page.goto('/as-set/AS-COLOCLUE')
    await hydrated(page)
    await expect(page.getByRole('status').filter({ hasText: 'Truncated' })).toBeVisible()
    await themes(page, 'as-set-truncated')
  })

  test('route-set view, and an as-set URL for a route-set redirects', async ({ page }) => {
    await page.goto('/as-set/RS-KROOT')
    await expect(page).toHaveURL('/route-set/RS-KROOT')
    await hydrated(page)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Report for route-set RS-KROOT',
    )
    const t = page.getByRole('region', { name: 'Expands to:' })
    await expect(t.getByRole('link', { name: '193.0.14.0/23' })).toHaveAttribute(
      'href',
      '/prefix/193.0.14.0/23',
    )
    await themes(page, 'route-set-RS-KROOT')
  })

  test('lower-case set names redirect and unknown sets say not found', async ({ page }) => {
    await page.goto('/as-set/as-ripencc')
    await expect(page).toHaveURL('/as-set/AS-RIPENCC')
    await page.goto('/as-set/AS-DOESNOTEXIST-NG-TEST')
    await hydrated(page)
    await expect(page.getByText('as-set was not found.')).toBeVisible()
  })

  test('reached by client-side search', async ({ page }) => {
    await page.goto('/')
    await hydrated(page)
    await search(page, 'as-ripencc')
    await expect(page).toHaveURL('/as-set/AS-RIPENCC')
  })
})

test.describe('other routes', () => {
  test('/query/ redirects to the right view on a full page load', async ({ page }) => {
    await page.goto('/query/AS3333')
    await expect(page).toHaveURL('/asn/AS3333')
    await page.goto('/query/193.0.0.0/21')
    await expect(page).toHaveURL('/prefix/193.0.0.0/21')
  })

  test('status page lists every source', async ({ page }) => {
    await page.goto('/status')
    await hydrated(page)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Data status')
    await expect(page.getByRole('row').filter({ hasText: 'MaxMind GeoLite2' })).toContainText(
      'GeoLite2-City built 2026-10-29',
    )
    for (const text of ['bgp.tools', 'RPKI', 'NRO delegated stats', 'RIPE', 'RADB']) {
      await expect(page.getByText(text).first()).toBeVisible()
    }
    await expect(page.getByText('OK', { exact: true }).first()).toBeVisible()
    await themes(page, 'status')
  })

  test('unknown paths show a not found page with search', async ({ page }) => {
    const res = await page.goto('/nope/nothing')
    expect(res?.status()).toBe(404)
    await hydrated(page)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found')
    await themes(page, 'not-found')
  })

  test('skip link and keyboard navigation reach the search box', async ({ page }) => {
    await page.goto('/prefix/193.0.0.0/21')
    await hydrated(page)
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(
      page.getByRole('textbox', { name: 'Prefix, IP, ASN or AS/route-set' }),
    ).toBeFocused()
  })
})
