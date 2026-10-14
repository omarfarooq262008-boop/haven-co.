import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { fetchHoldStatus, type HoldStatus } from '../lib/holds'

const POLL_MS = 1500
const TIMEOUT_MS = 45_000

type Outcome = 'success' | 'failed' | 'cancelled'

export function PaymentSuccessPage() {
  return <PaymentOutcomePage outcome="success" />
}

export function PaymentFailedPage() {
  return <PaymentOutcomePage outcome="failed" />
}

export function PaymentCancelledPage() {
  return <PaymentOutcomePage outcome="cancelled" />
}

/** Legacy ?status= route — redirects copy into the same UI. */
export function PaymentResultPage() {
  const [params] = useSearchParams()
  const status = params.get('status')
  const outcome: Outcome =
    status === 'success' ? 'success' : status === 'cancelled' ? 'cancelled' : 'failed'
  return <PaymentOutcomePage outcome={outcome} />
}

function PaymentOutcomePage({ outcome }: { outcome: Outcome }) {
  const [params] = useSearchParams()
  const routeParams = useParams()
  const holdId = params.get('hold') ?? routeParams.holdId ?? null

  if (outcome === 'success') {
    return <SuccessConfirming holdId={holdId} />
  }

  const copy =
    outcome === 'cancelled'
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
        {holdId ? <p className="mt-2 text-xs opacity-70">Reference: {holdId}</p> : null}
      </div>
      <ResultLinks />
    </div>
  )
}

function SuccessConfirming({ holdId }: { holdId: string | null }) {
  const [phase, setPhase] = useState<'confirming' | 'confirmed' | 'timeout' | 'failed'>('confirming')
  const [holdStatus, setHoldStatus] = useState<HoldStatus | null>(null)

  useEffect(() => {
    if (!holdId) {
      setPhase('timeout')
      return
    }

    let cancelled = false
    const started = Date.now()

    async function tick() {
      const result = await fetchHoldStatus(holdId!)
      if (cancelled) return
      if ('error' in result) {
        // RLS or lag — keep polling until timeout
      } else {
        setHoldStatus(result.status)
        if (result.status === 'active') {
          setPhase('confirmed')
          return
        }
        if (result.status === 'failed' || result.status === 'cancelled') {
          setPhase('failed')
          return
        }
      }
      if (Date.now() - started >= TIMEOUT_MS) {
        setPhase('timeout')
        return
      }
      window.setTimeout(() => void tick(), POLL_MS)
    }

    void tick()
    return () => {
      cancelled = true
    }
  }, [holdId])

  if (phase === 'confirming') {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <div className="glass-panel rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-amber-950">
          <h1 className="font-display text-3xl font-bold">Confirming your payment</h1>
          <p className="mt-3 text-sm leading-relaxed">
            We are waiting for the payment provider to confirm your hold. This usually takes a few
            seconds — please keep this page open.
          </p>
          {holdId ? <p className="mt-2 text-xs opacity-70">Reference: {holdId}</p> : null}
        </div>
      </div>
    )
  }

  if (phase === 'failed') {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <div className="glass-panel rounded-2xl border border-red-200 bg-red-50 px-5 py-6 text-red-900">
          <h1 className="font-display text-3xl font-bold">Payment not confirmed</h1>
          <p className="mt-3 text-sm leading-relaxed">
            The provider reported that this payment did not succeed
            {holdStatus ? ` (status: ${holdStatus})` : ''}. No hold was placed.
          </p>
        </div>
        <ResultLinks />
      </div>
    )
  }

  if (phase === 'timeout') {
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <div className="glass-panel rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-amber-950">
          <h1 className="font-display text-3xl font-bold">Still confirming</h1>
          <p className="mt-3 text-sm leading-relaxed">
            We have not received confirmation yet. If you were charged, your hold will appear under
            My bookings shortly once the provider webhook arrives. Do not pay again until you check
            there.
          </p>
          {holdId ? <p className="mt-2 text-xs opacity-70">Reference: {holdId}</p> : null}
        </div>
        <ResultLinks />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="glass-panel rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-6 text-emerald-950">
        <h1 className="font-display text-3xl font-bold">Payment successful</h1>
        <p className="mt-3 text-sm leading-relaxed">
          Your hold is confirmed. The property is reserved until the hold expires or your meeting
          time. Check My bookings for details.
        </p>
        {holdId ? <p className="mt-2 text-xs opacity-70">Reference: {holdId}</p> : null}
      </div>
      <ResultLinks />
    </div>
  )
}

function ResultLinks() {
  return (
    <div className="flex flex-wrap gap-3">
      <Link to="/my-bookings" className="btn-anim rounded-xl bg-ink px-5 py-3 font-semibold text-sand">
        My bookings
      </Link>
      <Link
        to="/"
        className="btn-anim rounded-xl border border-line bg-white/60 px-5 py-3 font-semibold text-ink"
      >
        Browse listings
      </Link>
    </div>
  )
}
