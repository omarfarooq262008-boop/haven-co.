import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Seo } from '../components/Seo'
import {
  displayMockAmount,
  parseMockCheckoutQuery,
  safeMockPaymentRedirect,
  submitMockCheckout,
  type MockCheckoutAction,
} from '../lib/mockCheckout'

export function MockCheckoutPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const parsed = useMemo(() => parseMockCheckoutQuery(params), [params])
  const [busy, setBusy] = useState<MockCheckoutAction | null>(null)
  const [error, setError] = useState<string | null>(null)

  const missing = !parsed.holdId || !parsed.ref

  async function handleAction(action: MockCheckoutAction) {
    if (missing || busy) return
    setBusy(action)
    setError(null)

    const candidate =
      action === 'succeed'
        ? parsed.successUrl
        : action === 'fail'
          ? parsed.failureUrl
          : parsed.cancelUrl

    const redirectTo = safeMockPaymentRedirect({
      action,
      holdId: parsed.holdId,
      candidateUrl: candidate,
      siteOrigin: window.location.origin,
    })

    const result = await submitMockCheckout({
      ref: parsed.ref,
      hold: parsed.holdId,
      action,
    })

    if (!result.ok) {
      setError(result.error)
      setBusy(null)
      return
    }

    navigate(redirectTo, { replace: true })
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      <Seo
        title="Mock checkout"
        description="Test payment page for Haven & Co holds. No real money."
        path="/mock-checkout"
        noIndex
      />

      <div className="glass-panel space-y-4 rounded-2xl px-5 py-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-gold-dark">Mock checkout</p>
        <h1 className="font-display text-3xl font-bold text-ink">Hold payment</h1>
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
          Test mode — no real money
        </p>
        <p className="text-sm text-ink-soft">
          This is a fake provider page for development. Card details are never collected. Choose an
          outcome to simulate the webhook.
        </p>

        <p className="font-display text-3xl font-bold text-ink">
          {displayMockAmount(parsed.amount, parsed.currency)}
        </p>

        {missing ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Missing checkout parameters. Start again from <strong>Hold this property</strong> on a
            listing.
          </p>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            disabled={missing || busy !== null}
            onClick={() => void handleAction('succeed')}
            className="btn-anim rounded-xl bg-ink px-5 py-3 font-semibold text-sand disabled:opacity-60"
          >
            {busy === 'succeed' ? 'Processing…' : 'Pay successfully'}
          </button>
          <button
            type="button"
            disabled={missing || busy !== null}
            onClick={() => void handleAction('fail')}
            className="btn-anim rounded-xl border border-red-200 bg-red-50 px-5 py-3 font-semibold text-red-800 disabled:opacity-60"
          >
            {busy === 'fail' ? 'Processing…' : 'Payment fails'}
          </button>
          <button
            type="button"
            disabled={missing || busy !== null}
            onClick={() => void handleAction('cancel')}
            className="btn-anim rounded-xl border border-line bg-white/70 px-5 py-3 font-semibold text-ink disabled:opacity-60"
          >
            {busy === 'cancel' ? 'Processing…' : 'Cancel'}
          </button>
        </div>
      </div>

      <Link to="/" className="inline-block text-sm text-ink-soft hover:text-ink">
        ← Browse listings
      </Link>
    </div>
  )
}
