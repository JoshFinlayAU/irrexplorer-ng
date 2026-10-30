import { useSuspenseQuery } from '@tanstack/react-query'
import { memberOfQuery } from '~/lib/queries'
import { MemberOfTable } from './set-tables'
import { badgeClass } from './status'

/** "Included in the following sets" table. The route loader preloads the data. */
export function MemberOfSection({
  target,
  objectClass,
  title,
}: {
  target: string
  objectClass: 'as-set' | 'route-set'
  title: string
}) {
  const { data } = useSuspenseQuery(memberOfQuery(target, objectClass))
  if (!data.ok) {
    return (
      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold">{title}</h2>
        <p role="alert" className={`rounded-md px-3 py-2 text-sm ${badgeClass.danger}`}>
          IRRd unavailable: {data.error}. Set membership could not be checked.
        </p>
      </section>
    )
  }
  return (
    <MemberOfTable
      memberOf={data.memberOf}
      objectClass={objectClass}
      title={title}
      jsonHref={`/api/sets/member-of/${objectClass}/${target}`}
    />
  )
}
