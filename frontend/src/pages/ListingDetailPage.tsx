import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DataState } from '../components/DataState'
import { HoldBadge } from '../components/HoldBadge'
import { ListingImage } from '../components/ListingImage'
import { ListingStatusBadge } from '../components/ListingStatusBadge'
import { ListingTypeBadge } from '../components/ListingTypeBadge'
import { Seo } from '../components/Seo'
import { useAuth } from '../context/AuthContext'
import { logAppEvent } from '../lib/appEvents'
import { formatListingPrice } from '../lib/format'
import { createOrOpenConversation } from '../lib/messaging'
import { realEstateListingJsonLd } from '../lib/seo'
import { supabase } from '../lib/supabase'
import type { Listing } from '../lib/types'

export function ListingDetailPage() {
  const { id } = useParams()
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [listing, setListing] = useState<Listing | null>(null)
  const [activePhoto, setActivePhoto] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reportMsg, setReportMsg] = useState<string | null>(null)
  const [reportBusy, setReportBusy] = useState(false)

  async function load() {
    if (!id) return
    setLoading(true)
    setError(null)
    const { data, error: qError } = await supabase.from('listings').select('*').eq('id', id).single()
    if (qError) {
      setError(qError.message)
      setListing(null)
    } else {
      setListing(data as Listing)
      setActivePhoto(0)
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when id changes
  }, [id])

  async function startConversation() {
    if (!user || !listing) {
      navigate('/login')
      return
    }

    setBusy(true)
    setError(null)

    const { conversationId, error: chatError } = await createOrOpenConversation({
      listingId: listing.id,
      buyerId: user.id,
      ownerId: listing.owner_id,
    })

    setBusy(false)
    if (chatError || !conversationId) {
      setError(chatError ?? 'Could not open conversation')
      return
    }
    navigate(`/messages/${conversationId}`)
  }

  async function submitReport() {
    if (!user || !listing) {
      navigate('/login', { state: { from: `/listings/${id}` } })
      return
    }
    const reason = reportReason.trim()
    if (reason.length < 3) {
      setReportMsg('Please add a short reason (at least 3 characters).')
      return
    }
    setReportBusy(true)
    setReportMsg(null)
    const { error: insertError } = await supabase.from('listing_reports').insert({
      listing_id: listing.id,
      reporter_id: user.id,
      reason,
    })
    setReportBusy(false)
    if (insertError) {
      if (insertError.code === '23505') {
        setReportMsg('You already have an open report for this listing.')
      } else {
        setReportMsg(insertError.message)
      }
      return
    }
    void logAppEvent('listing_reported', 'ListingDetailPage', { listing_id: listing.id })
    setReportReason('')
    setReportOpen(false)
    setReportMsg('Thanks — admins will review this report.')
  }

  if (loading || authLoading) {
    return <DataState loading loadingMessage="Loading listing…" />
  }

  if (error && !listing) {
    return (
      <DataState error={error} onRetry={() => void load()}>
        {null}
      </DataState>
    )
  }
  if (!listing) return null

  const photos = listing.image_urls?.length ? listing.image_urls : []
  const isOwner = user?.id === listing.owner_id
  const onHold = listing.hold_status === 'on_hold'
  const cover = photos[0] ?? null
  const desc = listing.description.slice(0, 160)

  return (
    <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      <Seo
        title={listing.title}
        description={`${formatListingPrice(Number(listing.price), listing.listing_type)} in ${listing.city}. ${desc}`}
        path={`/listings/${listing.id}`}
        image={cover}
        type="product"
        jsonLd={realEstateListingJsonLd({
          id: listing.id,
          title: listing.title,
          description: listing.description,
          price: Number(listing.price),
          listingType: listing.listing_type ?? 'sale',
          city: listing.city,
          address: listing.address,
          image: cover,
          bedrooms: listing.bedrooms,
          bathrooms: listing.bathrooms,
          areaSqft: listing.area_sqft,
        })}
      />

      <div className="space-y-3">
        <div className="aspect-[16/10] overflow-hidden rounded-2xl bg-line">
          {photos[activePhoto] ? (
            <ListingImage
              src={photos[activePhoto]}
              alt={`${listing.title} — photo ${activePhoto + 1} of ${photos.length}`}
              size="detail"
              loading={activePhoto === 0 ? 'eager' : 'lazy'}
              fetchPriority={activePhoto === 0 ? 'high' : 'auto'}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-ink-soft">No photos</div>
          )}
        </div>
        {photos.length > 1 && (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5" role="list" aria-label="Listing photos">
            {photos.map((url, index) => (
              <button
                key={url}
                type="button"
                role="listitem"
                aria-label={`Show photo ${index + 1}`}
                aria-current={index === activePhoto ? 'true' : undefined}
                onClick={() => setActivePhoto(index)}
                className={`overflow-hidden rounded-lg border-2 focus-visible:ring-2 focus-visible:ring-gold ${
                  index === activePhoto ? 'border-gold' : 'border-transparent'
                }`}
              >
                <ListingImage
                  src={url}
                  alt={`${listing.title} thumbnail ${index + 1}`}
                  size="detailThumb"
                  className="aspect-square w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="glass-panel space-y-4 rounded-2xl p-5 md:p-6">
        <Link to="/" className="text-sm text-ink-soft hover:text-ink">
          ← All listings
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <ListingTypeBadge listingType={listing.listing_type} />
          {onHold ? <HoldBadge /> : null}
          {isOwner || listing.status !== 'approved' ? (
            <ListingStatusBadge status={listing.status} />
          ) : null}
        </div>
        {onHold && !isOwner ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            This property is on hold. New meetings and holds are unavailable until it is free.
          </p>
        ) : null}
        {onHold && isOwner ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            This property is on hold for a paid viewing. Cancel the hold from My bookings if you need to
            free it (the visitor is refunded).
          </p>
        ) : null}
        {isOwner && listing.status === 'pending' ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Your listing is under review
          </p>
        ) : null}
        {isOwner && listing.status === 'rejected' ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {listing.rejection_reason
              ? `Rejected: ${listing.rejection_reason}`
              : 'This listing was rejected.'}
          </p>
        ) : null}
        <p className="font-display text-3xl font-bold text-ink">
          {formatListingPrice(Number(listing.price), listing.listing_type ?? 'sale')}
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">{listing.title}</h1>
        <p className="text-ink-soft">
          {listing.address ? `${listing.address}, ` : ''}
          {listing.city}
        </p>
        <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-white/70 p-4 text-sm">
          <div>
            <dt className="text-ink-soft">Type</dt>
            <dd className="capitalize font-medium text-ink">{listing.property_type}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Bedrooms</dt>
            <dd className="font-medium text-ink">{listing.bedrooms}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Bathrooms</dt>
            <dd className="font-medium text-ink">{listing.bathrooms}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Area</dt>
            <dd className="font-medium text-ink">{listing.area_sqft ? `${listing.area_sqft} sqft` : '—'}</dd>
          </div>
        </dl>
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Description</h2>
          <p className="mt-2 whitespace-pre-wrap leading-relaxed text-ink">{listing.description}</p>
        </div>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}
        {reportMsg && !reportOpen ? (
          <p className="rounded-xl border border-line bg-white/80 px-3 py-2 text-sm text-ink" role="status">
            {reportMsg}
          </p>
        ) : null}

        {isOwner ? (
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/listings/${listing.id}/edit`}
              className="btn-anim rounded-xl bg-ink px-5 py-3 font-semibold text-sand"
            >
              Edit listing
            </Link>
            <Link
              to="/my-listings"
              className="btn-anim rounded-xl border border-line bg-white/60 px-5 py-3 font-semibold"
            >
              My listings
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {!onHold ? (
                <Link
                  to={user ? `/listings/${listing.id}/book` : '/login'}
                  state={user ? undefined : { from: `/listings/${listing.id}/book` }}
                  className="btn-anim rounded-xl bg-gold px-5 py-3 font-semibold text-ink hover:bg-gold-dark"
                >
                  Book a meeting
                </Link>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => void startConversation()}
                className="btn-anim rounded-xl border border-line bg-white/60 px-5 py-3 font-semibold text-ink hover:bg-sand disabled:opacity-60"
              >
                {busy ? 'Opening chat…' : 'Message owner'}
              </button>
            </div>
            {!onHold ? (
              <Link
                to={user ? `/listings/${listing.id}/book?hold=1` : '/login'}
                state={user ? undefined : { from: `/listings/${listing.id}/book?hold=1` }}
                className="btn-anim rounded-xl border border-ink/20 bg-white/80 px-5 py-3 text-left text-sm font-semibold text-ink hover:bg-sand"
              >
                Hold this property
              </Link>
            ) : null}

            <div className="border-t border-line pt-3">
              {!reportOpen ? (
                <button
                  type="button"
                  className="text-sm font-semibold text-ink-soft underline hover:text-ink"
                  onClick={() => {
                    if (!user) {
                      navigate('/login', { state: { from: `/listings/${listing.id}` } })
                      return
                    }
                    setReportOpen(true)
                    setReportMsg(null)
                  }}
                >
                  Report this listing
                </button>
              ) : (
                <div className="space-y-2">
                  <label htmlFor="report-reason" className="block text-sm font-medium text-ink">
                    Why are you reporting this listing?
                  </label>
                  <textarea
                    id="report-reason"
                    rows={3}
                    maxLength={1000}
                    className="form-control w-full resize-y"
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    placeholder="Spam, misleading photos, scam, etc."
                  />
                  {reportMsg ? <p className="text-sm text-red-700">{reportMsg}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={reportBusy}
                      onClick={() => void submitReport()}
                      className="btn-anim rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-sand disabled:opacity-60"
                    >
                      {reportBusy ? 'Sending…' : 'Submit report'}
                    </button>
                    <button
                      type="button"
                      className="btn-anim rounded-xl border border-line px-4 py-2 text-sm font-semibold"
                      onClick={() => setReportOpen(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
