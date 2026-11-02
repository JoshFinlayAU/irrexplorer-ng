import { MoonIcon, SunIcon } from './icons'

/**
 * Runs before first paint so there is no flash of the wrong theme. The
 * server renders dark; only a stored "light" choice switches it.
 */
export const THEME_SCRIPT = `(function(){try{document.documentElement.classList.toggle('dark',localStorage.getItem('theme')!=='light')}catch(e){}})()`

export function ThemeToggle() {
  // Both icons render on server and client; CSS shows the right one, so the
  // markup never differs between SSR and hydration.
  return (
    <button
      type="button"
      onClick={() => {
        const dark = !document.documentElement.classList.contains('dark')
        document.documentElement.classList.toggle('dark', dark)
        try {
          localStorage.setItem('theme', dark ? 'dark' : 'light')
        } catch {
          // Storage can be blocked; the toggle still works for this page.
        }
      }}
      className="flex h-8 w-8 items-center justify-center border border-[var(--rule)] text-[var(--muted)] hover:border-[var(--text)] hover:text-[var(--text)]"
    >
      <span className="sr-only">Toggle dark mode</span>
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="block dark:hidden" />
    </button>
  )
}
