import { useSuspenseQuery } from '@tanstack/react-query'
import { MemberOfSection } from './member-of-section'
import { setQuery } from '~/lib/queries'
import { SetExpansionTable, type SetTableState } from './set-tables'
import { badgeClass } from './status'

export function SetPage({
  name,
  category,
  state,
  onChange,
}: {
  name: string
  category: 'as-set' | 'route-set'
  state: SetTableState
  onChange: (next: Partial<SetTableState>) => void
}) {
  const { data } = useSuspenseQuery(setQuery(name, category))
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">
        Report for {category} <span className="font-mono">{name}</span>
      </h1>
      {data.ok ? (
        <SetExpansionTable expansion={data.expansion} state={state} onChange={onChange} />
      ) : (
        <p role="alert" className={`mb-8 rounded-md px-3 py-2 text-sm ${badgeClass.danger}`}>
          IRRd unavailable: {data.error}. The set could not be expanded.
        </p>
      )}
      <p className="-mt-6 mb-8 text-right text-xs">
        <a href={`/api/sets/expand/${name}`}>Source data as JSON</a>
      </p>
      <MemberOfSection
        target={name}
        objectClass={category}
        title="Included in the following sets:"
      />
    </div>
  )
}
