import { listingTypeBadge } from '../lib/format'
import type { ListingType } from '../lib/types'

export function ListingTypeBadge({ listingType }: { listingType?: ListingType | null }) {
  const type = listingType === 'rent' ? 'rent' : 'sale'
  return (
    <span className="inline-flex rounded-full bg-ink/85 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sand">
      {listingTypeBadge(type)}
    </span>
  )
}
