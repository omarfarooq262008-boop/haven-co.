type Props = {
  resetError?: () => void
}

export function AppErrorFallback({ resetError }: Props) {
  return (
    <div className="app-shell app-shell--home min-h-screen">
      <div className="app-bg" aria-hidden="true" />
      <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-16">
        <div className="glass-panel max-w-md rounded-2xl px-6 py-8 text-center md:px-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold-dark">Haven & Co.</p>
          <h1 className="mt-2 font-display text-3xl font-bold text-ink">Something went wrong</h1>
          <p className="mt-3 text-sm text-ink-soft md:text-base">
            We hit an unexpected error. Try again, or go back to browsing listings.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {resetError ? (
              <button
                type="button"
                onClick={resetError}
                className="btn-anim rounded-xl bg-ink px-5 py-2.5 text-sm font-semibold text-sand"
              >
                Try again
              </button>
            ) : null}
            <a
              href="/"
              className="btn-anim rounded-xl bg-gold px-5 py-2.5 text-sm font-semibold text-ink hover:bg-gold-dark"
            >
              Back to home
            </a>
          </div>
        </div>
      </main>
    </div>
  )
}
