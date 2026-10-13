import { useState, type FormEvent } from 'react'
import { Seo } from '../components/Seo'

export function ContactPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    // mailto keeps ops simple for launch without a contact backend
    const subject = encodeURIComponent(`Haven & Co. contact from ${name.trim() || 'visitor'}`)
    const body = encodeURIComponent(`${message.trim()}\n\n— ${name.trim()}\n${email.trim()}`)
    window.location.href = `mailto:hello@havenandco.example?subject=${subject}&body=${body}`
    setSent(true)
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Seo
        title="Contact"
        description="Get in touch with Haven & Co. about listings, accounts, or safety reports."
        path="/contact"
      />
      <div className="glass-panel rounded-2xl px-5 py-6 md:px-7">
        <h1 className="font-display text-3xl font-bold text-ink">Contact</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Questions about a listing, your account, or something on the site? Send a note and we will get back to you.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
          <div>
            <label htmlFor="contact-name" className="block text-sm font-medium text-ink">
              Name
            </label>
            <input
              id="contact-name"
              className="form-control mt-1 w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
          </div>
          <div>
            <label htmlFor="contact-email" className="block text-sm font-medium text-ink">
              Email
            </label>
            <input
              id="contact-email"
              type="email"
              className="form-control mt-1 w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label htmlFor="contact-message" className="block text-sm font-medium text-ink">
              Message
            </label>
            <textarea
              id="contact-message"
              rows={5}
              className="form-control mt-1 w-full resize-y"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              minLength={10}
            />
          </div>
          <button type="submit" className="btn-anim rounded-xl bg-ink px-5 py-3 font-semibold text-sand">
            Open email draft
          </button>
          {sent ? (
            <p className="text-sm text-ink-soft" role="status">
              Your email app should open with the message. If it does not, write to hello@havenandco.example.
            </p>
          ) : null}
        </form>
      </div>
    </div>
  )
}
