import { useForm } from '@tanstack/react-form'
import { useNavigate } from '@tanstack/react-router'
import { useId } from 'react'
import { classifyQuery } from '~/lib/parse'
import { locationFor } from '~/lib/links'

export function SearchForm({ initial = '', large = false }: { initial?: string; large?: boolean }) {
  const navigate = useNavigate()
  const inputId = useId()
  const errorId = `${inputId}-error`
  const form = useForm({
    defaultValues: { query: initial },
    onSubmit: async ({ value }) => {
      const q = classifyQuery(value.query)
      if (q.kind === 'invalid') return
      await navigate(locationFor(q))
    },
  })

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
          return (
            <div>
              <label htmlFor={inputId} className="sr-only">
                Prefix, IP, ASN or AS/route-set
              </label>
              <div className="flex gap-2">
                <input
                  id={inputId}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Prefix, IP, ASN or AS/route-set"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  className={`surface min-w-0 flex-1 rounded-md px-3 font-mono text-[var(--text)] placeholder:font-sans placeholder:text-[var(--muted)] ${
                    large ? 'py-3 text-lg' : 'py-1.5 text-sm'
                  } ${error ? 'border-[var(--danger-fg)]' : ''}`}
                />
                <form.Subscribe selector={(s) => s.values.query.trim() === '' || s.isSubmitting}>
                  {(disabled) => (
                    <button
                      type="submit"
                      disabled={disabled}
                      className={`rounded-md bg-[var(--accent)] font-medium text-[var(--accent-contrast)] disabled:cursor-not-allowed disabled:opacity-50 ${
                        large ? 'px-5 py-3 text-lg' : 'px-3 py-1.5 text-sm'
                      }`}
                    >
                      Search
                    </button>
                  )}
                </form.Subscribe>
              </div>
              {error ? (
                <p id={errorId} role="alert" className="mt-1.5 text-sm text-[var(--danger-fg)]">
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
