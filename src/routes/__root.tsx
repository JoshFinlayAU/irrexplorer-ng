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
    <html lang="en" className="dark" suppressHydrationWarning>
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
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-[var(--panel)] focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="border-b border-[var(--rule)]">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 no-underline">
            <Logo />
            <span className="font-mono text-[0.95rem] font-semibold tracking-tight">
              irrexplorer<span className="text-[var(--faint)]">/ng</span>
            </span>
          </Link>
          {isHome ? (
            <div className="flex-1" />
          ) : (
            <div className="order-last w-full sm:order-none sm:w-auto sm:max-w-2xl sm:flex-1">
              <SearchForm />
            </div>
          )}
          <nav aria-label="Main" className="ml-auto flex items-center gap-4">
            <Link
              to="/status"
              className="label no-underline hover:text-[var(--text)]"
              activeProps={{ className: '!text-[var(--text)]', 'aria-current': 'page' }}
            >
              Data status
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1680px] flex-1 px-4 py-6 sm:px-6">
        <Outlet />
      </main>
      <footer className="border-t border-[var(--rule)]">
        <div className="mx-auto flex max-w-[1680px] flex-wrap justify-between gap-x-6 gap-y-1 px-4 py-3 font-mono text-[0.7rem] text-[var(--muted)] sm:px-6">
          <span>
            IRR Explorer NG, Athena Networks. Based on{' '}
            <a href="https://github.com/nlnog/irrexplorer">IRR explorer</a> by DashCare BV for
            Stichting NLNOG.
          </span>
          <span>
            Data from IRRd, bgp.tools, PeeringDB, RIPE RIS, the RIRs and RPKI. Includes GeoLite2
            data created by MaxMind, available from{' '}
            <a href="https://www.maxmind.com">maxmind.com</a>.
          </span>
        </div>
      </footer>
    </div>
  )
}

/** Three nested prefixes, as drawn in the address map. */
function Logo() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="1" y="3" width="22" height="5" fill="var(--text)" />
      <rect x="1" y="10" width="10" height="5" fill="var(--text)" />
      <rect x="13" y="10" width="10" height="5" fill="var(--rule-strong)" />
      <rect x="1" y="17" width="4.5" height="5" fill="var(--text)" />
      <rect x="6.5" y="17" width="4.5" height="5" fill="var(--danger-fg)" />
    </svg>
  )
}
