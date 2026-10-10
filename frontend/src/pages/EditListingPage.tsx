import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ListingForm } from '../components/ListingForm'
import { useAuth } from '../context/AuthContext'
import { emptyListingForm, listingPayloadFromForm, type ListingFormValues } from '../lib/listingForm'
import { deleteListingImages, resolveOrderedListingImages } from '../lib/listingImages'
import { supabase } from '../lib/supabase'
import type { Listing } from '../lib/types'

export function EditListingPage() {
  const { id } = useParams()
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id || !user) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data, error: qError } = await supabase.from('listings').select('*').eq('id', id).single()
      if (cancelled) return
      if (qError) setError(qError.message)
      else if (data && data.owner_id !== user.id) setError('You can only edit your own listings.')
      else setListing(data as Listing)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [id, user])

  if (authLoading) return <p className="text-ink-soft">Checking your account…</p>
  if (!user) return <Navigate to="/login" replace />
  if (loading) return <p className="text-ink-soft">Loading listing…</p>
  if (error || !listing) {
    return (
      <div className="space-y-3">
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error ?? 'Listing not found'}
        </p>
        <Link to="/my-listings" className="text-sm text-ink-soft hover:text-ink">
          ← My listings
        </Link>
      </div>
    )
  }

  const initial: ListingFormValues = {
    ...emptyListingForm(),
    title: listing.title,
    description: listing.description,
    price: String(listing.price),
    city: listing.city,
    address: listing.address ?? '',
    property_type: listing.property_type,
    listing_type: listing.listing_type ?? 'sale',
    bedrooms: String(listing.bedrooms),
    bathrooms: String(listing.bathrooms),
    area_sqft: listing.area_sqft != null ? String(listing.area_sqft) : '',
    status: listing.status,
  }

  const originalUrls = listing.image_urls ?? []

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="glass-panel rounded-2xl px-5 py-5 md:px-7">
        <p className="text-xs font-semibold uppercase tracking-wide text-gold-dark">Your property</p>
        <h1 className="mt-1 font-display text-3xl font-bold text-ink md:text-4xl">Edit listing</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft md:text-base">
          Update any section below. New photos are compressed on save; removed photos are deleted
          from storage.
        </p>
      </div>

      <ListingForm
        initial={initial}
        existingImageUrls={originalUrls}
        requireImages
        showStatus
        submitLabel="Save changes"
        busyLabel="Saving…"
        onSubmit={async (values, images, reportProgress) => {
          const imageUrls = await resolveOrderedListingImages(user.id, images, reportProgress)
          if (imageUrls.length < 1) throw new Error('Keep or upload at least one photo')

          const keptExisting = images
            .filter((item): item is { kind: 'existing'; url: string } => item.kind === 'existing')
            .map((item) => item.url)
          const removed = originalUrls.filter((url) => !keptExisting.includes(url))
          if (removed.length > 0) {
            await deleteListingImages(removed)
          }

          const payload = listingPayloadFromForm(values, user.id, imageUrls)
          const { error: updateError } = await supabase
            .from('listings')
            .update({
              title: payload.title,
              description: payload.description,
              price: payload.price,
              city: payload.city,
              address: payload.address,
              property_type: payload.property_type,
              listing_type: payload.listing_type,
              bedrooms: payload.bedrooms,
              bathrooms: payload.bathrooms,
              area_sqft: payload.area_sqft,
              image_urls: payload.image_urls,
              status: payload.status,
            })
            .eq('id', listing.id)
            .eq('owner_id', user.id)

          if (updateError) throw new Error(updateError.message)
          navigate(`/listings/${listing.id}`)
        }}
      />
    </div>
  )
}
