import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ListingImage } from '../components/ListingImage'
import { formatMeetingAt } from '../lib/booking'
import {
  cancelHold,
  formatHoldFee,
  holdExpiryCountdown,
  holdStatusLabel,
  type HoldStatus,
} from '../lib/holds'
import { hasMoreRows, PAGE_SIZE, rangeForPage } from '../lib/pagination'
import { supabase } from '../lib/supabase'
import type { Booking, HoldRow } from '../lib/types'

type HoldWithBooking = HoldRow & {
  bookings?: Pick<
    Booking,
    'id' | 'meeting_at' | 'visitor_name' | 'visitor_email' | 'visitor_phone' | 'note' | 'status' | 'owner_id'
  > | null
  listings?: {
    id: string
    title: string
    city: string
    address: string
    image_urls: string[]
    owner_id: string
  } | null
}

export function MyBookingsPage() {
  const { user, loading: authLoading } = useAuth()
  const location = useLocation()
  const justBooked = Boolean((location.state as { booked?: boolean } | null)?.booked)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [holds, setHolds] = useState<HoldWithBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showBookedNotice, setShowBookedNotice] = useState(justBooked)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (justBooked) setShowBookedNotice(true)
  }, [justBooked])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const isFirstPage = page === 0
    ;(async () => {
      if (isFirstPage) setLoading(true)
      else setLoadingMore(true)
      setError(null)

      const { from, to } = rangeForPage(page, PAGE_SIZE.bookings)
      const bookingsRes = await supabase
        .from('bookings')
          .select('*, listings(id, title, city, address, image_urls)')
        .or(`visitor_id.eq.${user.id},owner_id.eq.${user.id}`)
        .order('meeting_at', { ascending: true })
        .range(from, to)

      if (cancelled) return
      if (bookingsRes.error) {
        setError(bookingsRes.error.message)
        setLoading(false)
        setLoadingMore(false)
        return
      }

      const rows = (bookingsRes.data ?? []) as Booking[]
      setBookings((prev) => (isFirstPage ? rows : [...prev, ...rows]))
      setHasMore(hasMoreRows(rows.length, PAGE_SIZE.bookings))

      const bookingIds = rows.map((b) => b.id)
      if (bookingIds.length > 0) {
        const holdsRes = await supabase
          .from('holds')
          .select(
            '*, bookings(id, meeting_at, visitor_name, visitor_email, visitor_phone, note, status, owner_id), listings(id, title, city, address, image_urls, owner_id)',
          )
          .in('booking_id', bookingIds)
          .order('created_at', { ascending: false })

        if (cancelled) return
        if (holdsRes.error) {
          // Holds table may not exist until migration is applied
          console.error('[my-bookings] holds', holdsRes.error.message)
        } else {
          const nextHolds = (holdsRes.data ?? []) as HoldWithBooking[]
          setHolds((prev) => (isFirstPage ? nextHolds : [...prev, ...nextHolds]))
        }
      } else if (isFirstPage) {
        setHolds([])
      }
      setLoading(false)
      setLoadingMore(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user, page])

  const holdByBookingId = useMemo(() => {
    const map = new Map<string, HoldWithBooking>()
    for (const hold of holds) {
      map.set(hold.booking_id, hold)
    }
    return map
  }, [holds])

  if (authLoading) return <p className="text-ink-soft">Checking your account…</p>
  if (!user) {
    return <Navigate to="/login" replace state={{ from: '/my-bookings' }} />
  }

  async function cancelBooking(booking: Booking) {
    const hold = holdByBookingId.get(booking.id)
    const asOwner = booking.owner_id === user!.id

    // Owner cancelling an active/pending hold → refund path via Edge Function
    if (asOwner && hold && (hold.status === 'active' || hold.status === 'pending_payment')) {
      if (
        !window.confirm(
          hold.status === 'active'
            ? 'Cancel this hold? The visitor will be refunded and the listing will be freed.'
            : 'Cancel this unpaid hold? The listing slot will be freed.',
        )
      ) {
        return
      }
      setBusyId(booking.id)
      setError(null)
      const result = await cancelHold(hold.id)
      if ('error' in result) {
        setError(result.error)
        setBusyId(null)
        return
      }
      setHolds((prev) =>
        prev.map((item) =>
          item.id === hold.id
            ? {
                ...item,
                status: hold.status === 'active' ? 'refunded' : 'cancelled',
              }
            : item,
        ),
      )
      setBookings((prev) =>
        prev.map((item) => (item.id === booking.id ? { ...item, status: 'cancelled' } : item)),
      )
      setBusyId(null)
      return
    }

    if (!window.confirm('Cancel this meeting?')) return
    setBusyId(booking.id)
    setError(null)
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', booking.id)

    if (updateError) {
      setError(updateError.message)
      setBusyId(null)
      return
    }
    setBookings((prev) =>
      prev.map((item) => (item.id === booking.id ? { ...item, status: 'cancelled' } : item)),
    )
    setBusyId(null)
  }

  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-2xl px-5 py-4">
        <h1 className="font-display text-3xl font-bold text-ink">My bookings</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Meetings you requested, paid holds, and viewings for your listings.
        </p>
      </div>

      {showBookedNotice && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          Meeting booked. A confirmation email is on its way.
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => setShowBookedNotice(false)}
          >
            Dismiss
          </button>
        </p>
      )}

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      )}

      {loading ? (
        <p className="text-ink-soft">Loading bookings…</p>
      ) : bookings.length === 0 ? (
        <p className="text-ink-soft">No bookings yet.</p>
      ) : (
        <>
        <ul className="space-y-3">
          {bookings.map((booking) => {
            const listing = booking.listings
            const hold = holdByBookingId.get(booking.id)
            const asOwner = booking.owner_id === user.id
            const cancelled = booking.status === 'cancelled'
            const pendingPay = booking.status === 'pending'
            const canOwnerCancelHold =
              asOwner &&
              hold &&
              (hold.status === 'active' || hold.status === 'pending_payment') &&
              !cancelled

            return (
              <li key={booking.id} className="glass-card flex flex-col gap-4 rounded-2xl p-4 sm:flex-row">
                <div className="h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-line">
                  {listing?.image_urls?.[0] ? (
                    <ListingImage
                      src={listing.image_urls[0]}
                      alt=""
                      size="thumb"
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                        cancelled
                          ? 'border-line bg-sand text-ink-soft'
                          : pendingPay
                            ? 'border-amber-200 bg-amber-100 text-amber-950'
                            : 'border-emerald-200 bg-emerald-100 text-emerald-900'
                      }`}
                    >
                      {cancelled ? 'Cancelled' : pendingPay ? 'Pending payment' : 'Confirmed'}
                    </span>
                    {hold ? (
                      <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-950">
                        {holdStatusLabel(hold.status as HoldStatus)}
                        {' · '}
                        {formatHoldFee(hold.amount, hold.currency)}
                      </span>
                    ) : null}
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                      {asOwner ? 'As owner' : 'As visitor'}
                    </span>
                  </div>
                  {listing ? (
                    <Link
                      to={`/listings/${listing.id}`}
                      className="font-semibold text-ink hover:text-gold-dark"
                    >
                      {listing.title}
                    </Link>
                  ) : (
                    <p className="font-semibold text-ink">Listing unavailable</p>
                  )}
                  <p className="text-sm text-ink-soft">{formatMeetingAt(booking.meeting_at)}</p>
                  {hold ? (
                    <p className="text-sm text-ink-soft">
                      Hold expires {formatMeetingAt(hold.expires_at)}
                      {hold.status === 'active' || hold.status === 'pending_payment'
                        ? ` · ${holdExpiryCountdown(hold.expires_at, nowMs)}`
                        : null}
                      {hold.status === 'active'
                        ? ' · Refundable if the owner cancels; not if the visitor no-shows'
                        : null}
                    </p>
                  ) : null}
                  {asOwner ? (
                    <p className="text-sm text-ink-soft">
                      Visitor: {booking.visitor_name} · {booking.visitor_email} · {booking.visitor_phone}
                    </p>
                  ) : (
                    <p className="text-sm text-ink-soft">
                      {booking.visitor_name} · {booking.visitor_email}
                    </p>
                  )}
                  {booking.note ? <p className="text-sm text-ink-soft">Note: {booking.note}</p> : null}
                </div>
                {canOwnerCancelHold ? (
                  <button
                    type="button"
                    disabled={busyId === booking.id}
                    onClick={() => void cancelBooking(booking)}
                    className="btn-anim h-fit rounded-xl border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    {busyId === booking.id ? 'Cancelling…' : 'Cancel hold'}
                  </button>
                ) : !cancelled && !hold ? (
                  <button
                    type="button"
                    disabled={busyId === booking.id}
                    onClick={() => void cancelBooking(booking)}
                    className="btn-anim h-fit rounded-xl border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    {busyId === booking.id ? 'Cancelling…' : 'Cancel'}
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
        {hasMore ? (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => setPage((p) => p + 1)}
              className="btn-anim rounded-xl border border-line px-5 py-2 text-sm font-semibold text-ink hover:bg-sand disabled:opacity-60"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        ) : null}
        </>
      )}
    </div>
  )
}
