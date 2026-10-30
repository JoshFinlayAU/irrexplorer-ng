// Runs against real upstreams (LIVE_BASE_URL, default the dev server on
// :3000) with structure-only assertions, since live data changes. Excluded
// from the normal network-free projects; run with `pnpm test:live`.
import { checkA11y, expect, hydrated, test } from './helpers'

const screens: [string, RegExp][] = [
  ['/', /IRR Explorer/],
  ['/prefix/193.0.0.0/21', /Report for prefix 193\.0\.0\.0\/21/],
  ['/prefix/2001:67c:2e8::/48', /Report for prefix 2001:67c:2e8::\/48/],
  ['/prefix/1.1.1.1', /Report for prefix 1\.1\.1\.1/],
  ['/asn/AS3333', /Report for ASN AS3333/],
  ['/asn/AS13335', /Report for ASN AS13335/],
  ['/as-set/AS-RIPENCC', /Report for as-set AS-RIPENCC/],
  ['/as-set/AS-KPN', /Report for as-set AS-KPN/],
  ['/route-set/RS-KROOT', /Report for route-set RS-KROOT/],
  ['/status', /Data status/],
]

for (const [path, heading] of screens) {
  test(`@live ${path}`, async ({ page }) => {
    await page.goto(path, { timeout: 170_000 })
    await hydrated(page)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading)
    await expect(page.getByRole('region', { name: 'Data source notices' })).toHaveCount(0)
    await checkA11y(page)
  })
}
