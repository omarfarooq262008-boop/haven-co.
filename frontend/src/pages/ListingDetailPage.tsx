import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ListingTypeBadge } from '../components/ListingTypeBadge'
import { useAuth } from '../context/AuthContext'
import { formatListingPrice } from '../lib/format'
import { createOrOpenConversation } from '../lib/messaging'
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
        setActivePhoto(0)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
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

  if (loading || authLoading) return <p className="text-ink-soft">Loading listing…</p>
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

  const photos = listing.image_urls?.length ? listing.image_urls : []
  const isOwner = user?.id === listing.owner_id

  return (
    <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-3">
        <div className="aspect-[16/10] overflow-hidden rounded-2xl bg-line">
          {photos[activePhoto] ? (
            <img
              src={photos[activePhoto]}
              alt={`${listing.title} photo ${activePhoto + 1}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-ink-soft">No photos</div>
          )}
        </div>
        {photos.length > 1 && (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {photos.map((url, index) => (
              <button
                key={url}
                type="button"
                onClick={() => setActivePhoto(index)}
                className={`overflow-hidden rounded-lg border-2 ${
                  index === activePhoto ? 'border-gold' : 'border-transparent'
                }`}
              >
                <img src={url} alt="" className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="glass-panel space-y-4 rounded-2xl p-5 md:p-6">
        <Link to="/" className="text-sm text-ink-soft hover:text-ink">
          ← All listings
        </Link>
        <ListingTypeBadge listingType={listing.listing_type} />
        <p className="font-display text-3xl font-bold text-ink">
          {formatListingPrice(Number(listing.price), listing.listing_type ?? 'sale')}
        </p>
        <h1 className="font-display text-2xl font-semibold text-ink">{listing.title}</h1>
        <p className="text-ink-soft">
          {listing.address ? `${listing.address}, ` : ''}
          {listing.city}
        </p>
        <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-white/50 p-4 text-sm">
          <div>
            <dt className="text-ink-soft">Type</dt>
            <dd className="capitalize font-medium">{listing.property_type}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Status</dt>
            <dd className="capitalize font-medium">{listing.status}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Bedrooms</dt>
            <dd className="font-medium">{listing.bedrooms}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Bathrooms</dt>
            <dd className="font-medium">{listing.bathrooms}</dd>
          </div>
          <div>
            <dt className="text-ink-soft">Area</dt>
            <dd className="font-medium">{listing.area_sqft ? `${listing.area_sqft} sqft` : '—'}</dd>
          </div>
        </dl>
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Description</h2>
          <p className="mt-2 whitespace-pre-wrap leading-relaxed text-ink">{listing.description}</p>
        </div>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        )}

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
          <button
            type="button"
            disabled={busy}
            onClick={() => void startConversation()}
            className="btn-anim rounded-xl bg-gold px-5 py-3 font-semibold text-ink hover:bg-gold-dark disabled:opacity-60"
          >
            {busy ? 'Opening chat…' : 'Message owner'}
          </button>
        )}
      </div>
    </div>
  )
}
