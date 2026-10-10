import { Navigate, useNavigate } from 'react-router-dom'
import { ListingForm } from '../components/ListingForm'
import { useAuth } from '../context/AuthContext'
import { emptyListingForm, listingPayloadFromForm } from '../lib/listingForm'
import { resolveOrderedListingImages } from '../lib/listingImages'
import { supabase } from '../lib/supabase'

export function NewListingPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  if (loading) return <p className="text-ink-soft">Checking your account…</p>
  if (!user) return <Navigate to="/login" replace />

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="glass-panel rounded-2xl px-5 py-5 md:px-7">
        <p className="text-xs font-semibold uppercase tracking-wide text-gold-dark">New property</p>
        <h1 className="mt-1 font-display text-3xl font-bold text-ink md:text-4xl">Add listing</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft md:text-base">
          Fill in each section below. Required fields are marked with *. Photos are compressed to
          ~300 KB before upload.
        </p>
      </div>

      <ListingForm
        initial={emptyListingForm()}
        requireImages
        submitLabel="Publish listing"
        busyLabel="Compressing & uploading…"
        onSubmit={async (values, images, reportProgress) => {
          const imageUrls = await resolveOrderedListingImages(user.id, images, reportProgress)
          if (imageUrls.length < 1) throw new Error('Add at least one photo')
          const payload = listingPayloadFromForm(values, user.id, imageUrls)
          const { data, error } = await supabase.from('listings').insert(payload).select('id').single()
          if (error) throw new Error(error.message)
          navigate(`/listings/${data.id}`)
        }}
      />
    </div>
  )
}
