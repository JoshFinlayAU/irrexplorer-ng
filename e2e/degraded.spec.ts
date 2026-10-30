// Partial failure: the degraded instance has IRRd, bgp.tools, the RPKI
// validator and the RIR stats all failing; only RIPEstat works. Every page
// must still render, with a clear notice per missing source.
import { checkA11y, DEGRADED, expect, hydrated, shot, test } from './helpers'

test.use({ baseURL: DEGRADED })

test('prefix page renders with notices and RIS fallback', async ({ page }) => {
  await page.goto('/prefix/193.0.0.0/21')
  await hydrated(page)
  const notices = page.getByRole('region', { name: 'Data source notices' })
  await expect(notices).toContainText('IRRd unavailable')
  await expect(notices).toContainText('BGP origins come from RIPE RIS instead')
  await expect(notices).toContainText('RPKI validator unavailable')
  await expect(notices).toContainText('RIR delegation data unavailable')
  const row = page
    .getByRole('region', { name: /Directly overlapping/ })
    .getByRole('row')
    .filter({ hasText: '193.0.0.0/21' })
  await expect(row).toContainText('3333')
  await expect(row).toContainText('Some checks were skipped because IRR, RPKI data is unavailable')
  await expect(row).not.toContainText('Everything looks good')
  await checkA11y(page)
  await shot(page, 'degraded-prefix')
})

test('ASN page renders from RIS only', async ({ page }) => {
  await page.goto('/asn/AS3333')
  await hydrated(page)
  await expect(page.getByRole('region', { name: 'Data source notices' })).toContainText('RIPE RIS')
  await expect(page.getByRole('region', { name: /Prefixes originated by AS3333/ })).toContainText(
    '193.0.0.0/21',
  )
  await expect(page.getByText('IRRd unavailable').first()).toBeVisible()
  await checkA11y(page)
  await shot(page, 'degraded-asn')
})

test('set page explains IRRd is down', async ({ page }) => {
  await page.goto('/as-set/AS-RIPENCC')
  await hydrated(page)
  await expect(page.getByText(/IRRd unavailable: .* The set could not be expanded\./)).toBeVisible()
  await checkA11y(page)
  await shot(page, 'degraded-set')
})

test('status page shows each failure', async ({ page }) => {
  await page.goto('/status')
  await hydrated(page)
  await expect(page.getByText(/Error: HTTP 503/).first()).toBeVisible()
  await expect(page.getByText(/Validator unavailable/)).toBeVisible()
  await expect(page.getByText(/IRRd unavailable/)).toBeVisible()
  await checkA11y(page)
  await shot(page, 'degraded-status')
})

test('healthz reports failures without failing itself', async ({ request }) => {
  const res = await request.get(`${DEGRADED}/healthz`)
  expect(res.status()).toBe(200)
  const body = (await res.json()) as { datasets: { lastError: string | null }[] }
  expect(body.datasets.every((d) => d.lastError)).toBe(true)
})
