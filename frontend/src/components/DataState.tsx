import { Link } from 'react-router-dom'

type Props = {
  loading?: boolean
  error?: string | null
  empty?: boolean
  emptyMessage?: string
  loadingMessage?: string
  offlineHint?: boolean
  children?: React.ReactNode
  onRetry?: () => void
}

export function DataState({
  loading,
  error,
  empty,
  emptyMessage = 'Nothing here yet.',
  loadingMessage = 'Loading…',
  offlineHint = true,
  children,
  onRetry,
}: Props) {
  if (loading) {
    return (
      <p className="text-ink-soft" role="status" aria-live="polite">
        {loadingMessage}
      </p>
    )
  }

  if (error) {
    const offline = offlineHint && typeof navigator !== 'undefined' && !navigator.onLine
    return (
      <div
        className="glass-panel space-y-3 rounded-2xl border border-red-200 bg-red-50/90 px-4 py-4 text-sm text-red-900"
        role="alert"
      >
        <p className="font-semibold">{offline ? 'You appear to be offline' : 'Something went wrong'}</p>
        <p>{offline ? 'Check your connection, then try again.' : error}</p>
        <div className="flex flex-wrap gap-2">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="btn-anim rounded-xl bg-ink px-4 py-2 font-semibold text-sand"
            >
              Try again
            </button>
          ) : null}
          <Link to="/" className="btn-anim rounded-xl border border-line bg-white/80 px-4 py-2 font-semibold text-ink">
            Browse listings
          </Link>
        </div>
      </div>
    )
  }

  if (empty) {
    return <p className="text-ink-soft">{emptyMessage}</p>
  }

  return <>{children}</>
}
