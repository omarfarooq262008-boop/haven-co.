export function HoldBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-950 ${className}`}
    >
      On hold
    </span>
  )
}
