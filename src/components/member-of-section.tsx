import { useSuspenseQuery } from '@tanstack/react-query'
import { memberOfQuery } from '~/lib/queries'
import { MemberOfTable } from './set-tables'
import { SeverityTag } from './status'
import { SectionHead } from './ui'

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
      <section className="mb-10">
        <SectionHead title={title} />
        <p
          role="alert"
          className="grid grid-cols-[auto_1fr] items-baseline gap-3 border border-[var(--rule-strong)] bg-[var(--panel)] px-3 py-2 text-sm"
        >
          <SeverityTag category="danger" />
          <span>IRRd unavailable: {data.error}. Set membership could not be checked.</span>
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
