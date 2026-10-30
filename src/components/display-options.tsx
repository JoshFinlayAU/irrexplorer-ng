import { useId } from 'react'

export interface DisplayOptionsValue {
  reduced: boolean
  issues: boolean
  filter: string
}

export function DisplayOptions({
  value,
  onChange,
}: {
  value: DisplayOptionsValue
  onChange: (next: Partial<DisplayOptionsValue>) => void
}) {
  const filterId = useId()
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.reduced}
          onChange={(e) => onChange({ reduced: e.target.checked })}
        />
        Reduced colour mode
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.issues}
          onChange={(e) => onChange({ issues: e.target.checked })}
        />
        Show only error/warning
      </label>
      <div className="flex items-center gap-2">
        <label htmlFor={filterId}>Filter</label>
        <input
          id={filterId}
          type="search"
          value={value.filter}
          onChange={(e) => onChange({ filter: e.target.value })}
          placeholder="Prefix, ASN, IRR or message"
          className="surface w-56 rounded-md px-2 py-1"
        />
      </div>
    </div>
  )
}
