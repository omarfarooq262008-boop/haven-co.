import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ListingImage } from '../components/ListingImage'
import { ListingStatusBadge } from '../components/ListingStatusBadge'
import { ListingTypeBadge } from '../components/ListingTypeBadge'
import { useAuth } from '../context/AuthContext'
import { logAppEvent } from '../lib/appEvents'
import { formatListingPrice } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { Listing } from '../lib/types'

export function AdminPage() {
  const { user, profile, loading: authLoading } = useAuth()
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectDrafts, setRejectDrafts] = useState<Record<string, string>>({})

  const isAdmin = Boolean(profile?.is_admin)

  useEffect(() => {
    if (!user || !isAdmin) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      const { data, error: qError } = await supabase
        .from('listings')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
      if (cancelled) return
      if (qError) setError(qError.message)
      else setListings((data ?? []) as Listing[])
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user, isAdmin])

  if (authLoading) return <p className="text-ink-soft">Checking your account…</p>
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) {
    return (
      <div className="space-y-3">
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Admin access only.
        </p>
        <Link to="/" className="text-sm text-ink-soft hover:text-ink">
          ← Browse listings
        </Link>
      </div>
    )
  }

  async function setStatus(listing: Listing, status: 'approved' | 'rejected', reason?: string) {
    setBusyId(listing.id)
    setError(null)
    const { error: updateError } = await supabase
      .from('listings')
      .update({
        status,
        rejection_reason: status === 'rejected' ? (reason?.trim() || null) : null,
      })
      .eq('id', listing.id)

    if (updateError) {
      setError(updateError.message)
      setBusyId(null)
      return
    }
    void logAppEvent(status === 'approved' ? 'listing_approved' : 'listing_rejected', 'AdminPage', {
      listing_id: listing.id,
    })
    setListings((prev) => prev.filter((item) => item.id !== listing.id))
    setBusyId(null)
  }

  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-2xl px-5 py-4">
        <h1 className="font-display text-3xl font-bold text-ink">Admin</h1>
        <p className="mt-1 text-sm text-ink-soft">Review pending listings before they go public.</p>
      </div>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      )}

      {loading ? (
        <p className="text-ink-soft">Loading pending listings…</p>
      ) : listings.length === 0 ? (
        <p className="text-ink-soft">No listings waiting for review.</p>
      ) : (
        <ul className="space-y-4">
          {listings.map((listing) => (
            <li key={listing.id} className="glass-card space-y-4 rounded-2xl p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="h-24 w-32 shrink-0 overflow-hidden rounded-lg bg-line">
                  {listing.image_urls?.[0] ? (
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
                    <ListingTypeBadge listingType={listing.listing_type} />
                    <ListingStatusBadge status={listing.status} />
                  </div>
                  <Link
                    to={`/listings/${listing.id}`}
                    className="font-semibold text-ink hover:text-gold-dark"
                  >
                    {listing.title}
                  </Link>
                  <p className="text-sm text-ink-soft">
                    {formatListingPrice(Number(listing.price), listing.listing_type ?? 'sale')} ·{' '}
                    {listing.city}
                  </p>
                  <p className="line-clamp-2 text-sm text-ink-soft">{listing.description}</p>
                </div>
              </div>

              <div className="space-y-2 border-t border-line pt-3">
                <label className="block text-sm font-medium text-ink" htmlFor={`reject-${listing.id}`}>
                  Rejection reason (optional)
                </label>
                <textarea
                  id={`reject-${listing.id}`}
                  rows={2}
                  maxLength={500}
                  value={rejectDrafts[listing.id] ?? ''}
                  onChange={(e) =>
                    setRejectDrafts((prev) => ({ ...prev, [listing.id]: e.target.value }))
                  }
                  placeholder="Shown to the owner if you reject…"
                  className="form-control w-full resize-y"
                  disabled={busyId === listing.id}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === listing.id}
                    onClick={() => void setStatus(listing, 'approved')}
                    className="btn-anim rounded-xl bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-60"
                  >
                    {busyId === listing.id ? 'Saving…' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === listing.id}
                    onClick={() => void setStatus(listing, 'rejected', rejectDrafts[listing.id])}
                    className="btn-anim rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
