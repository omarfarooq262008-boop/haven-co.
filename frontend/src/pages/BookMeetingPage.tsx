import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  BOOKING_LIMITS,
  BOOKING_SLOT_HOURS,
  emptyBookingForm,
  fetchBookedHoursForDate,
  formatSlotLabel,
  localMeetingAt,
  localTimezoneLabel,
  minBookableDateInput,
  notifyBookingEmail,
  validateBookingForm,
  type BookingFormErrors,
  type BookingFormValues,
} from '../lib/booking'
import { friendlyError } from '../lib/errors'
import {
  createHoldCheckout,
  DEFAULT_HOLD_FEE_PKR,
  fetchHoldFeePkr,
  formatHoldFee,
  HOLD_DURATION_HOURS,
} from '../lib/holds'
import { supabase } from '../lib/supabase'
import type { Listing } from '../lib/types'

export function BookMeetingPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const holdMode = searchParams.get('hold') === '1' || searchParams.get('mode') === 'hold'
  const { user, profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [values, setValues] = useState<BookingFormValues>(() => emptyBookingForm())
  const [errors, setErrors] = useState<BookingFormErrors>({})
  const [bookedHours, setBookedHours] = useState<Set<number>>(new Set())
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [holdFee, setHoldFee] = useState(DEFAULT_HOLD_FEE_PKR)

  useEffect(() => {
    if (!user) return
    setValues(
      emptyBookingForm({
        name: profile?.full_name,
        email: user.email,
        phone: profile?.phone,
      }),
    )
  }, [user, profile])

  useEffect(() => {
    if (!holdMode) return
    let cancelled = false
    ;(async () => {
      const fee = await fetchHoldFeePkr()
      if (!cancelled) setHoldFee(fee)
    })()
    return () => {
      cancelled = true
    }
  }, [holdMode])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      const { data, error: qError } = await supabase.from('listings').select('*').eq('id', id).single()
      if (cancelled) return
      if (qError) {
        setError(qError.message)
        setListing(null)
      } else {
        setListing(data as Listing)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (!listing || !values.date) {
      setBookedHours(new Set())
      return
    }
    let cancelled = false
    ;(async () => {
      setSlotsLoading(true)
      const { hours, error: slotError } = await fetchBookedHoursForDate(listing.id, values.date)
      if (cancelled) return
      if (slotError) setError(slotError)
      setBookedHours(hours)
      setSlotsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [listing, values.date])

  if (authLoading) return <p className="text-ink-soft">Checking your account…</p>
  if (!user) {
    const from = holdMode ? `/listings/${id}/book?hold=1` : `/listings/${id}/book`
    return <Navigate to="/login" replace state={{ from }} />
  }
  if (loading) return <p className="text-ink-soft">Loading listing…</p>

  if (error && !listing) {
    return (
      <div className="space-y-3">
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
        <Link to="/" className="text-sm text-ink-soft hover:text-ink">
          ← Back to listings
        </Link>
      </div>
    )
  }

  if (!listing) return null

  if (user.id === listing.owner_id) {
    return <Navigate to={`/listings/${listing.id}`} replace />
  }

  if (listing.status !== 'approved') {
    return (
      <div className="space-y-3">
        <p className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          This listing is not available for booking yet.
        </p>
        <Link to={`/listings/${listing.id}`} className="text-sm text-ink-soft hover:text-ink">
          ← Back to listing
        </Link>
      </div>
    )
  }

  const onHold = listing.hold_status === 'on_hold'
  if (onHold) {
    return (
      <div className="space-y-3">
        <p className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          This property is currently on hold. Booking and new holds are paused until it is free again.
        </p>
        <Link to={`/listings/${listing.id}`} className="text-sm text-ink-soft hover:text-ink">
          ← Back to listing
        </Link>
      </div>
    )
  }

  function update<K extends keyof BookingFormValues>(key: K, value: BookingFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!listing || !user) return
    setError(null)

    const nextErrors = validateBookingForm(values, { bookedHours })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const hour = Number(values.hour)
    const meetingAt = localMeetingAt(values.date, hour)
    if (Number.isNaN(meetingAt.getTime())) {
      setErrors({ date: 'Invalid date or time' })
      return
    }

    setBusy(true)
    try {
      if (holdMode) {
        const result = await createHoldCheckout({
          listingId: listing.id,
          visitor_name: values.visitor_name.trim(),
          visitor_email: values.visitor_email.trim(),
          visitor_phone: values.visitor_phone.trim(),
          meeting_at: meetingAt.toISOString(),
          note: values.note.trim(),
        })
        if ('error' in result) {
          throw new Error(friendlyError(result.error, 'Could not start hold checkout'))
        }
        // Hosted checkout — never collect cards in our UI
        window.location.assign(result.checkoutUrl)
        return
      }

      const { data, error: insertError } = await supabase
        .from('bookings')
        .insert({
          listing_id: listing.id,
          owner_id: listing.owner_id,
          visitor_id: user.id,
          visitor_name: values.visitor_name.trim(),
          visitor_email: values.visitor_email.trim(),
          visitor_phone: values.visitor_phone.trim(),
          meeting_at: meetingAt.toISOString(),
          note: values.note.trim(),
          status: 'confirmed',
        })
        .select('id')
        .single()

      if (insertError) {
        if (insertError.code === '23505') {
          throw new Error('That time slot was just booked. Please choose another.')
        }
        throw new Error(
          friendlyError(
            insertError.message,
            "You've booked too many meetings recently. Please try again in a bit.",
          ),
        )
      }

      if (data?.id) {
        await notifyBookingEmail(data.id)
      }

      navigate('/my-bookings', { state: { booked: true } })
    } catch (err) {
      setError(err instanceof Error ? err.message : holdMode ? 'Could not start hold' : 'Could not book meeting')
    } finally {
      setBusy(false)
    }
  }

  const availableHours = BOOKING_SLOT_HOURS.filter(
    (hour) => !bookedHours.has(hour) && !isPastSlot(values.date, hour),
  )

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="glass-panel rounded-2xl px-5 py-5 md:px-7">
        <p className="text-xs font-semibold uppercase tracking-wide text-gold-dark">
          {holdMode ? 'Secure the property' : 'Schedule a visit'}
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-ink md:text-4xl">
          {holdMode ? 'Hold this property' : 'Book a meeting'}
        </h1>
        <p className="mt-2 text-sm text-ink-soft md:text-base">
          For <span className="font-medium text-ink">{listing.title}</span>
          {listing.address ? ` · ${listing.address}, ${listing.city}` : ` · ${listing.city}`}. Times are
          shown in your local timezone ({localTimezoneLabel()}).
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to={`/listings/${listing.id}/book`}
            className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${
              !holdMode ? 'bg-ink text-sand' : 'border border-line bg-white/60 text-ink'
            }`}
          >
            Book a meeting
          </Link>
          <Link
            to={`/listings/${listing.id}/book?hold=1`}
            className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${
              holdMode ? 'bg-ink text-sand' : 'border border-line bg-white/60 text-ink'
            }`}
          >
            Hold this property
          </Link>
        </div>
        <Link to={`/listings/${listing.id}`} className="mt-3 inline-block text-sm text-ink-soft hover:text-ink">
          ← Back to listing
        </Link>
      </div>

      {holdMode ? (
        <div className="glass-panel space-y-2 rounded-2xl border border-amber-200/80 bg-amber-50/60 px-5 py-4 text-sm text-amber-950">
          <p>
            <strong>Hold fee:</strong> {formatHoldFee(holdFee)} — paid to the platform through a secure
            checkout page (you will leave this site briefly). We never ask for card details on Haven &amp; Co.
          </p>
          <p>
            The hold lasts <strong>{HOLD_DURATION_HOURS} hours</strong> or until your meeting time, whichever
            comes first.
          </p>
          <p>
            <strong>Refunds:</strong> fully refundable if the owner cancels or declines. Not refundable if you
            do not show up for the meeting.
          </p>
          <p>Your meeting is only confirmed after payment succeeds.</p>
        </div>
      ) : null}

      <form className="listing-form glass-panel space-y-5 overflow-hidden rounded-2xl p-5 md:p-7" onSubmit={handleSubmit} noValidate>
        <div className="form-grid-2">
          <Field label="Name" required htmlFor="book-name" error={errors.visitor_name}>
            <input
              id="book-name"
              className="form-control"
              value={values.visitor_name}
              maxLength={BOOKING_LIMITS.nameMax}
              onChange={(e) => update('visitor_name', e.target.value)}
              autoComplete="name"
            />
          </Field>
          <Field label="Email" required htmlFor="book-email" error={errors.visitor_email}>
            <input
              id="book-email"
              type="email"
              className="form-control"
              value={values.visitor_email}
              maxLength={BOOKING_LIMITS.emailMax}
              onChange={(e) => update('visitor_email', e.target.value)}
              autoComplete="email"
            />
          </Field>
        </div>

        <Field label="Phone" required htmlFor="book-phone" error={errors.visitor_phone}>
          <input
            id="book-phone"
            type="tel"
            className="form-control"
            value={values.visitor_phone}
            maxLength={BOOKING_LIMITS.phoneMax}
            onChange={(e) => update('visitor_phone', e.target.value)}
            autoComplete="tel"
          />
        </Field>

        <div className="form-grid-2">
          <Field label="Date" required htmlFor="book-date" error={errors.date}>
            <input
              id="book-date"
              type="date"
              className="form-control"
              min={minBookableDateInput()}
              value={values.date}
              onChange={(e) => {
                update('date', e.target.value)
                update('hour', '')
              }}
            />
          </Field>
          <Field
            label="Time slot"
            required
            htmlFor="book-hour"
            error={errors.hour}
            hint={slotsLoading ? 'Checking availability…' : 'Hourly from 10:00 to 18:00'}
          >
            <select
              id="book-hour"
              className="form-control"
              value={values.hour}
              disabled={!values.date || slotsLoading}
              onChange={(e) => update('hour', e.target.value)}
            >
              <option value="">Select a time</option>
              {availableHours.map((hour) => (
                <option key={hour} value={String(hour)}>
                  {formatSlotLabel(hour)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {values.date && !slotsLoading && availableHours.length === 0 ? (
          <p className="text-sm text-ink-soft">No open slots on this date. Try another day.</p>
        ) : null}

        <Field label="Note" htmlFor="book-note" error={errors.note} hint="Optional — anything the owner should know">
          <textarea
            id="book-note"
            rows={3}
            className="form-control min-h-[88px] resize-y"
            maxLength={BOOKING_LIMITS.noteMax}
            value={values.note}
            onChange={(e) => update('note', e.target.value)}
            placeholder="e.g. Looking to visit with a partner…"
          />
        </Field>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button
            type="submit"
            disabled={busy}
            className="btn-anim rounded-xl bg-ink px-6 py-3 font-semibold text-sand disabled:opacity-60"
          >
            {busy
              ? holdMode
                ? 'Redirecting…'
                : 'Booking…'
              : holdMode
                ? `Pay and book (${formatHoldFee(holdFee)})`
                : 'Confirm meeting'}
          </button>
          <p className="text-xs text-ink-soft">
            {holdMode
              ? 'You will complete payment on the provider’s secure page.'
              : 'You’ll get a confirmation email after booking.'}
          </p>
        </div>
      </form>
    </div>
  )
}

function isPastSlot(dateStr: string, hour: number): boolean {
  if (!dateStr) return true
  return localMeetingAt(dateStr, hour).getTime() <= Date.now()
}

function Field({
  label,
  required,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string
  required?: boolean
  htmlFor?: string
  error?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="form-row">
      <div className="form-row-label">
        <label htmlFor={htmlFor} className="font-medium text-ink">
          {label}
          {required ? <span className="text-gold-dark"> *</span> : null}
        </label>
      </div>
      <div className="form-row-field min-w-0">
        {children}
        {hint && !error ? <p className="form-row-hint">{hint}</p> : null}
        {error ? <p className="mt-1.5 text-sm text-red-700">{error}</p> : null}
      </div>
    </div>
  )
}
