import { useForm } from '@tanstack/react-form'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useId, useRef } from 'react'
import { classifyQuery, setType, type Query } from '~/lib/parse'
import { locationFor } from '~/lib/links'

/** What the input will be treated as, shown live inside the command bar. */
export function describeQuery(q: Query): string | null {
  switch (q.kind) {
    case 'prefix': {
      const p = q.prefix
      if (q.isHost) return `ipv${p.version} host`
      return `ipv${p.version} /${p.length}`
    }
    case 'asn':
      return q.asn > 65535 ? 'asn 32-bit' : 'asn'
    case 'set':
      return setType(q.name)
    case 'invalid':
      return null
  }
}

/**
 * The command bar. Pressing "/" anywhere focuses it, like most tools engineers
 * already use. The input is classified as you type so a typo is visible
 * before submitting.
 */
export function SearchForm({ initial = '', large = false }: { initial?: string; large?: boolean }) {
  const navigate = useNavigate()
  const inputId = useId()
  const errorId = `${inputId}-error`
  const inputRef = useRef<HTMLInputElement>(null)
  const form = useForm({
    defaultValues: { query: initial },
    onSubmit: async ({ value }) => {
      const q = classifyQuery(value.query)
      if (q.kind === 'invalid') return
      inputRef.current?.blur()
      await navigate(locationFor(q))
    },
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      // With several bars on a page (home), the first one wins.
      if (document.querySelector('[data-command-input]') !== inputRef.current) return
      e.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <form
      role="search"
      className="w-full"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field
        name="query"
        validators={{
          onSubmit: ({ value }) => {
            const q = classifyQuery(value)
            return q.kind === 'invalid' ? q.reason : undefined
          },
        }}
      >
        {(field) => {
          const error = field.state.meta.errors[0]
          const value = field.state.value
          const hint = value.trim() ? describeQuery(classifyQuery(value)) : null
          return (
            <div className="relative">
              <label htmlFor={inputId} className="sr-only">
                Prefix, IP, ASN or AS/route-set
              </label>
              <div
                className={`group flex items-stretch border bg-[var(--panel)] focus-within:border-[var(--text)] ${
                  error ? 'border-[var(--danger-fg)]' : 'border-[var(--rule-strong)]'
                } ${large ? 'h-14' : 'h-9'}`}
              >
                <span
                  aria-hidden="true"
                  className={`flex items-center pl-3 font-mono text-[var(--faint)] group-focus-within:text-[var(--text)] ${
                    large ? 'pr-3 text-xl' : 'pr-2 text-sm'
                  }`}
                >
                  &gt;
                </span>
                <input
                  id={inputId}
                  ref={inputRef}
                  data-command-input=""
                  name={field.name}
                  value={value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="193.0.0.0/21  AS3333  AS-RIPENCC"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  className={`min-w-0 flex-1 bg-transparent font-mono text-[var(--text)] outline-none placeholder:text-[var(--faint)] focus-visible:outline-none ${
                    large ? 'text-xl' : 'text-sm'
                  }`}
                />
                {hint ? (
                  <span
                    aria-live="polite"
                    className="label hidden items-center px-3 whitespace-nowrap sm:flex"
                  >
                    {hint}
                  </span>
                ) : (
                  <kbd
                    aria-hidden="true"
                    className="mx-2 hidden self-center border border-[var(--rule-strong)] px-1.5 font-mono text-[0.7rem] text-[var(--faint)] sm:block"
                  >
                    /
                  </kbd>
                )}
                <form.Subscribe selector={(s) => s.values.query.trim() === '' || s.isSubmitting}>
                  {(disabled) => (
                    <button
                      type="submit"
                      disabled={disabled}
                      className={`border-l border-[var(--rule-strong)] font-mono font-medium tracking-wide uppercase hover:bg-[var(--invert-bg)] hover:text-[var(--invert-text)] disabled:cursor-not-allowed disabled:text-[var(--faint)] disabled:hover:bg-transparent ${
                        large ? 'px-6 text-sm' : 'px-3 text-[0.7rem]'
                      }`}
                    >
                      Search
                    </button>
                  )}
                </form.Subscribe>
              </div>
              {error ? (
                <p
                  id={errorId}
                  role="alert"
                  className="mt-1.5 font-mono text-xs text-[var(--danger-fg)]"
                >
                  {error}
                </p>
              ) : null}
            </div>
          )
        }}
      </form.Field>
    </form>
  )
}
