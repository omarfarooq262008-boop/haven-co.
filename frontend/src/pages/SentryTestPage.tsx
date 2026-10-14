import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { isSentryEnabled, sendTestMessage } from '../lib/sentry'
import { NotFoundPage } from './NotFoundPage'
import { Seo } from '../components/Seo'

/**
 * Hidden admin-only route for verifying Sentry wiring.
 * Non-admins (and signed-out users) see the normal 404 page.
 */
export function SentryTestPage() {
  const { user, profile, loading } = useAuth()
  const [status, setStatus] = useState<string | null>(null)

  if (loading) {
    return <p className="text-ink-soft">Checking your account…</p>
  }

  if (!user || !profile?.is_admin) {
    return <NotFoundPage />
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Seo title="Sentry test" noIndex />
      <div className="glass-panel space-y-4 rounded-2xl px-5 py-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-gold-dark">Admin only</p>
        <h1 className="font-display text-3xl font-bold text-ink">Sentry test</h1>
        <p className="text-sm text-ink-soft">
          {isSentryEnabled()
            ? 'DSN is set — events should appear in your Sentry project.'
            : 'VITE_SENTRY_DSN is not set — buttons will not reach Sentry.'}
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            className="btn-anim rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-sand"
            onClick={() => {
              throw new Error('Haven Sentry test: frontend error')
            }}
          >
            Throw frontend error
          </button>
          <button
            type="button"
            className="btn-anim rounded-xl border border-line bg-white/80 px-4 py-3 text-sm font-semibold text-ink"
            onClick={() => {
              setStatus(sendTestMessage())
            }}
          >
            Send test message
          </button>
        </div>

        {status ? (
          <p className="text-sm text-ink-soft" role="status">
            {status}
          </p>
        ) : null}
      </div>
    </div>
  )
}
