import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ListingImage } from '../components/ListingImage'
import { ListingStatusBadge } from '../components/ListingStatusBadge'
import { ListingTypeBadge } from '../components/ListingTypeBadge'
import { formatListingPrice } from '../lib/format'
import { deleteListingImages } from '../lib/listingImages'
import { supabase } from '../lib/supabase'
import type { Listing } from '../lib/types'

export function MyListingsPage() {
  const { user, loading: authLoading } = useAuth()
  const location = useLocation()
  const underReview = Boolean((location.state as { underReview?: boolean } | null)?.underReview)
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showReviewNotice, setShowReviewNotice] = useState(underReview)

  useEffect(() => {
    if (underReview) setShowReviewNotice(true)
  }, [underReview])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      const { data, error: qError } = await supabase
        .from('listings')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (qError) setError(qError.message)
      else setListings((data ?? []) as Listing[])
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  if (authLoading) return <p className="text-ink-soft">Checking your account…</p>
  if (!user) return <Navigate to="/login" replace />

  async function removeListing(listing: Listing) {
    if (!window.confirm('Delete this listing and its photos? This cannot be undone.')) return
    setDeletingId(listing.id)
    setError(null)

    try {
      if (listing.image_urls?.length) {
        await deleteListingImages(listing.image_urls)
      }
      const { error: delError } = await supabase.from('listings').delete().eq('id', listing.id)
      if (delError) throw new Error(delError.message)
      setListings((prev) => prev.filter((item) => item.id !== listing.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete listing')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="glass-panel rounded-2xl px-5 py-4">
          <h1 className="font-display text-3xl font-bold text-ink">My listings</h1>
          <p className="mt-1 text-sm text-ink-soft">Edit or delete properties you own.</p>
        </div>
        <Link
          to="/listings/new"
          className="btn-anim rounded-xl bg-gold px-4 py-2 text-sm font-semibold text-ink hover:bg-gold-dark"
        >
          Add listing
        </Link>
      </div>

      {showReviewNotice && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Your listing is under review
          <button
            type="button"
            className="ml-3 text-amber-800 underline"
            onClick={() => setShowReviewNotice(false)}
          >
            Dismiss
          </button>
        </p>
      )}

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      )}

      {loading ? (
        <p className="text-ink-soft">Loading your listings…</p>
      ) : listings.length === 0 ? (
        <p className="text-ink-soft">You haven&apos;t listed any properties yet.</p>
      ) : (
        <ul className="space-y-3">
          {listings.map((listing) => (
            <li
              key={listing.id}
              className="glass-card flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center"
            >
              <div className="h-20 w-28 shrink-0 overflow-hidden rounded-lg bg-line">
                {listing.image_urls?.[0] ? (
                  <ListingImage
                    src={listing.image_urls[0]}
                    alt=""
                    size="thumb"
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <ListingTypeBadge listingType={listing.listing_type} />
                  <ListingStatusBadge status={listing.status} />
                </div>
                <Link to={`/listings/${listing.id}`} className="font-semibold text-ink hover:text-gold-dark">
                  {listing.title}
                </Link>
                <p className="text-sm text-ink-soft">
                  {formatListingPrice(Number(listing.price), listing.listing_type ?? 'sale')} ·{' '}
                  {listing.city}
                </p>
                <p className="text-sm text-ink-soft">
                  {listing.bedrooms} beds · {listing.bathrooms} baths
                </p>
                {listing.status === 'rejected' && listing.rejection_reason ? (
                  <p className="mt-1 text-sm text-red-700">Rejected: {listing.rejection_reason}</p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Link
                  to={`/listings/${listing.id}/edit`}
                  className="btn-anim rounded-xl border border-line px-3 py-1.5 text-sm font-medium hover:bg-sand"
                >
                  Edit
                </Link>
                <button
                  type="button"
                  disabled={deletingId === listing.id}
                  onClick={() => void removeListing(listing)}
                  className="btn-anim rounded-xl border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  {deletingId === listing.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
