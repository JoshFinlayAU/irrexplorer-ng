import { MoonIcon, SunIcon } from './icons'

/**
 * Runs before first paint so there is no flash of the wrong theme. The
 * stored choice wins, otherwise the system preference.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}})()`

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
      className="rounded-md p-2 text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
    >
      <span className="sr-only">Toggle dark mode</span>
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="block dark:hidden" />
    </button>
  )
}
