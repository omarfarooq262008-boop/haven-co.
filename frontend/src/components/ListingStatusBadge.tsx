import type { ListingStatus } from '../lib/types'

const LABELS: Record<ListingStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

const STYLES: Record<ListingStatus, string> = {
  pending: 'bg-amber-100 text-amber-900 border-amber-200',
  approved: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
}

export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  const key = status in LABELS ? status : 'pending'
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STYLES[key]}`}
    >
      {LABELS[key]}
    </span>
  )
}
