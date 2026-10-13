import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { isSupabaseConfigured } from '../lib/supabase'

type HealthPayload = {
  status?: string
  checks?: {
    database?: string
    storage?: string
    auth?: string
  }
  ms?: number
  error?: string
}

type UiState =
  | { kind: 'loading' }
  | { kind: 'ok'; checks: HealthPayload['checks']; ms?: number }
  | { kind: 'problem'; checks?: HealthPayload['checks']; detail?: string }

export function StatusPage() {
  const [state, setState] = useState<UiState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!isSupabaseConfigured()) {
        if (!cancelled) {
          setState({ kind: 'problem', detail: 'Frontend is missing Supabase configuration.' })
        }
        return
      }

      const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
      if (!base || !key) {
        if (!cancelled) setState({ kind: 'problem', detail: 'Missing API configuration.' })
        return
      }

      try {
        const res = await fetch(`${base}/functions/v1/health`, {
          method: 'GET',
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
          },
        })
        const data = (await res.json().catch(() => ({}))) as HealthPayload
        if (cancelled) return

        if (res.ok && data.status === 'ok') {
          setState({ kind: 'ok', checks: data.checks, ms: data.ms })
        } else {
          setState({
            kind: 'problem',
            checks: data.checks,
            detail: data.error === 'rate_limited' ? 'Health check is temporarily rate limited.' : undefined,
          })
        }
      } catch {
        if (!cancelled) {
          setState({ kind: 'problem', detail: 'Could not reach the health endpoint.' })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const ok = state.kind === 'ok'

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div
        className={`glass-panel rounded-2xl border px-5 py-8 ${
          state.kind === 'loading'
            ? 'border-line'
            : ok
              ? 'border-emerald-200 bg-emerald-50/80'
              : 'border-red-200 bg-red-50/80'
        }`}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-gold-dark">System status</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-ink">
          {state.kind === 'loading'
            ? 'Checking…'
            : ok
              ? 'All systems working'
              : 'Problem detected'}
        </h1>
        <p className="mt-3 text-sm text-ink-soft">
          {state.kind === 'loading'
            ? 'Asking the API about database, storage, and auth.'
            : ok
              ? 'Database, storage, and auth responded normally.'
              : state.detail ||
                'One or more backend checks failed. The site may still load, but some features could be down.'}
        </p>

        {state.kind !== 'loading' && state.checks ? (
          <ul className="mt-5 space-y-2 text-sm">
            {(['database', 'storage', 'auth'] as const).map((key) => {
              const value = state.checks?.[key] ?? 'unknown'
              const pass = value === 'ok'
              return (
                <li
                  key={key}
                  className="flex items-center justify-between rounded-xl border border-line/70 bg-white/70 px-3 py-2 capitalize"
                >
                  <span>{key}</span>
                  <span className={pass ? 'font-semibold text-emerald-800' : 'font-semibold text-red-700'}>
                    {pass ? 'OK' : 'Fail'}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : null}

        {state.kind === 'ok' && state.ms != null ? (
          <p className="mt-4 text-xs text-ink-soft">Responded in {state.ms} ms</p>
        ) : null}
      </div>

      <Link to="/" className="inline-block text-sm text-ink-soft hover:text-ink">
        ← Back to listings
      </Link>
    </div>
  )
}
