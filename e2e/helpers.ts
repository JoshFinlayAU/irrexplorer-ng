import AxeBuilder from '@axe-core/playwright'
import { expect, test as base, type Page } from '@playwright/test'

export const DEGRADED = 'http://localhost:3101'

/** Fails the test on any console error/warning or uncaught page error, including hydration mismatches. */
export const test = base.extend<{ consoleProblems: string[] }>({
  consoleProblems: [
    async ({ page }, use) => {
      const problems: string[] = []
      page.on('console', (msg) => {
        if (msg.type() !== 'error' && msg.type() !== 'warning') return
        const text = msg.text()
        // Browsers log failed resource loads for deliberate 404 checks.
        if (/Failed to load resource: the server responded with a status of 404/.test(text)) return
        // Firefox's performance advisory for any window-scroll virtualizer; not an app error.
        if (/scroll-linked positioning effect/.test(text)) return
        problems.push(`${msg.type()}: ${text}`)
      })
      page.on('pageerror', (err) => {
        // Benign per the ResizeObserver spec; WebKit reports it when the
        // virtualizer re-measures rows. It is not an application error.
        if (/ResizeObserver loop/.test(err.message)) return
        problems.push(`pageerror: ${err.message}`)
      })
      await use(problems)
      expect(problems, 'console errors, warnings or hydration problems').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** Wait until React has hydrated (the search button reacts to input only after hydration). */
export async function hydrated(page: Page) {
  await page.waitForFunction(() => document.readyState === 'complete')
  await page.waitForLoadState('networkidle')
}

export async function checkA11y(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact ?? 'n/a'}): ${v.help} -> ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join(', ')}`,
  )
  expect(summary, 'axe violations').toEqual([])
}

export async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: theme })
}

export async function shot(page: Page, name: string) {
  const project = test.info().project.name
  // Browsers cap screenshots at 32767 device pixels; very tall pages get a viewport shot.
  const height = await page.evaluate(
    () => document.documentElement.scrollHeight * window.devicePixelRatio,
  )
  await page.screenshot({
    path: `e2e/screenshots/${project}/${name}.png`,
    fullPage: height < 30_000,
  })
}

/** Navigate client-side through the header or home search box. */
export async function search(page: Page, query: string) {
  const box = page
    .getByRole('searchbox')
    .or(page.getByRole('textbox', { name: 'Prefix, IP, ASN or AS/route-set' }))
    .first()
  await box.fill(query)
  await page.getByRole('button', { name: 'Search' }).first().click()
}
