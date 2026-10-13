import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Seo title="Page not found" description="That page does not exist on Haven & Co." path="/404" noIndex />
      <div className="glass-panel rounded-2xl px-5 py-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-gold-dark">404</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-ink">Page not found</h1>
        <p className="mt-3 text-sm text-ink-soft">
          The link may be broken, or the listing was removed. Head back to browse homes for sale and rent.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/" className="btn-anim rounded-xl bg-ink px-5 py-3 font-semibold text-sand">
            Browse listings
          </Link>
          <Link to="/contact" className="btn-anim rounded-xl border border-line bg-white/80 px-5 py-3 font-semibold text-ink">
            Contact us
          </Link>
        </div>
      </div>
    </div>
  )
}
