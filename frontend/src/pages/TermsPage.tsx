import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'

export function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-5">
      <Seo
        title="Terms of Use"
        description="Terms for using Haven & Co. listings, messaging, bookings, and holds."
        path="/terms"
      />
      <div className="glass-panel space-y-4 rounded-2xl px-5 py-6 md:px-7">
        <h1 className="font-display text-3xl font-bold text-ink">Terms of Use</h1>
        <p className="text-sm text-ink-soft">Last updated: October 2026</p>
        <div className="space-y-3 text-sm leading-relaxed text-ink">
          <p>
            By creating an account or using Haven &amp; Co., you agree to these terms. Listings must be accurate and
            lawful. You may only list properties you are authorized to market.
          </p>
          <p>
            New listings are reviewed before they appear publicly. We may reject or remove listings that violate these
            terms or applicable law. Messaging and booking tools are for genuine inquiries only — no spam or harassment.
          </p>
          <p>
            Paid holds are subject to the hold fee and refund rules shown at checkout. The platform may collect the fee;
            refunds follow the stated policy (for example, when an owner cancels). We do not guarantee that any viewing
            will result in a sale or lease.
          </p>
          <p>
            The service is provided as-is. To the extent allowed by law, Haven &amp; Co. is not liable for disputes
            between users, property condition, or third-party payment outages.
          </p>
          <p>
            See also our <Link className="font-semibold text-gold-dark underline" to="/privacy">Privacy Policy</Link>.
          </p>
        </div>
      </div>
    </article>
  )
}
