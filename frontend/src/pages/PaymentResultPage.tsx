import { Link, useSearchParams } from 'react-router-dom'

export function PaymentResultPage() {
  const [params] = useSearchParams()
  const status = params.get('status') ?? 'failed'
  const holdId = params.get('hold')

  const copy =
    status === 'success'
      ? {
          title: 'Payment successful',
          body: 'Your hold is confirmed. The property is reserved until the hold expires or your meeting time. Check My bookings for details.',
          tone: 'border-emerald-200 bg-emerald-50 text-emerald-950',
        }
      : status === 'cancelled'
        ? {
            title: 'Payment cancelled',
            body: 'No charge was made. You can try holding the property again from the listing page.',
            tone: 'border-line bg-sand/80 text-ink',
          }
        : {
            title: 'Payment failed',
            body: 'The payment did not go through. The meeting was not confirmed. You can try again from the listing.',
            tone: 'border-red-200 bg-red-50 text-red-900',
          }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className={`glass-panel rounded-2xl border px-5 py-6 ${copy.tone}`}>
        <h1 className="font-display text-3xl font-bold">{copy.title}</h1>
        <p className="mt-3 text-sm leading-relaxed">{copy.body}</p>
        {holdId ? (
          <p className="mt-2 text-xs opacity-70">Reference: {holdId}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          to="/my-bookings"
          className="btn-anim rounded-xl bg-ink px-5 py-3 font-semibold text-sand"
        >
          My bookings
        </Link>
        <Link
          to="/"
          className="btn-anim rounded-xl border border-line bg-white/60 px-5 py-3 font-semibold text-ink"
        >
          Browse listings
        </Link>
      </div>
    </div>
  )
}
