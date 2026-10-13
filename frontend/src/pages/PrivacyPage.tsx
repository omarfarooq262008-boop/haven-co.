import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'

export function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-5">
      <Seo
        title="Privacy Policy"
        description="How Haven & Co. collects, uses, and protects your personal information."
        path="/privacy"
      />
      <div className="glass-panel space-y-4 rounded-2xl px-5 py-6 md:px-7">
        <h1 className="font-display text-3xl font-bold text-ink">Privacy Policy</h1>
        <p className="text-sm text-ink-soft">Last updated: October 2026</p>
        <div className="space-y-3 text-sm leading-relaxed text-ink">
          <p>
            Haven &amp; Co. (“we”) helps people list and discover homes. We collect account details you provide
            (name, email, phone), listing content and photos you upload, messages you send, and booking
            information needed to arrange viewings.
          </p>
          <p>
            We use this data to operate the marketplace, send transactional emails (bookings, messages, listing
            review), prevent abuse, and improve reliability. We do not sell your personal data.
          </p>
          <p>
            Payments for property holds are processed by a payment provider; we do not store card numbers on our
            servers. Error monitoring may receive technical diagnostics with personal data scrubbed where possible.
          </p>
          <p>
            You may update your profile, change your password, or delete your account from the Account page. Deleting
            your account removes your listings, photos, messages, and related booking records we control.
          </p>
          <p>
            Contact us via the <Link className="font-semibold text-gold-dark underline" to="/contact">Contact</Link>{' '}
            page with privacy questions.
          </p>
        </div>
      </div>
    </article>
  )
}
