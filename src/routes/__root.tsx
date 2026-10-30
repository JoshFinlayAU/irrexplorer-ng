import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouterState,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import appCss from '~/styles.css?url'
import { SearchForm } from '~/components/search-form'
import { THEME_SCRIPT, ThemeToggle } from '~/components/theme-toggle'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'IRR Explorer NG' },
      {
        name: 'description',
        content: 'Gain insights and debug your Internet Routing Registry configuration',
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    ],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    // The theme script sets the class before hydration, so allow the mismatch here only.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="min-h-screen">
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function RootLayout() {
  const isHome = useRouterState({ select: (s) => s.location.pathname === '/' })
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-[var(--surface)] focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <Link
            to="/"
            className="flex items-center gap-2 font-semibold text-[var(--text)] hover:no-underline"
          >
            <Logo />
            <span>
              IRR Explorer <span className="text-[var(--accent)]">NG</span>
            </span>
          </Link>
          {isHome ? (
            <div className="flex-1" />
          ) : (
            <div className="order-last w-full sm:order-none sm:w-auto sm:max-w-xl sm:flex-1">
              <SearchForm />
            </div>
          )}
          <nav aria-label="Main" className="ml-auto flex items-center gap-1 text-sm">
            <Link
              to="/status"
              className="rounded-md px-2 py-1.5 text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] hover:no-underline"
              activeProps={{ className: 'text-[var(--text)] font-medium', 'aria-current': 'page' }}
            >
              Data status
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-[var(--border)] py-4 text-center text-xs text-[var(--muted)]">
        IRR Explorer NG by Athena Networks. Based on{' '}
        <a href="https://github.com/nlnog/irrexplorer">IRR explorer</a> by DashCare BV for Stichting
        NLNOG. Data from IRRd, bgp.tools, RIPE RIS, the RIRs and RPKI.
      </footer>
    </div>
  )
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--accent)" />
      <path
        d="M8 22V10m0 0h5a3.5 3.5 0 010 7H8m5 0l4 5m3-12h4m-2 0v12m-2 0h4"
        stroke="var(--accent-contrast)"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
