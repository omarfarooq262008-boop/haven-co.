import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  LIMITS,
  PROPERTY_TYPES,
  validateListingForm,
  type ListingFormErrors,
  type ListingFormValues,
} from '../lib/listingForm'
import type { OrderedListingImage, UploadProgress } from '../lib/listingImages'
import type { ListingType, PropertyType } from '../lib/types'
import {
  PhotoUploader,
  galleryFromUrls,
  revokeGalleryPreviews,
  type GalleryPhoto,
} from './PhotoUploader'

type Props = {
  initial: ListingFormValues
  existingImageUrls?: string[]
  submitLabel: string
  busyLabel: string
  requireImages?: boolean
  onSubmit: (
    values: ListingFormValues,
    images: OrderedListingImage[],
    reportProgress: (progress: UploadProgress | null) => void,
  ) => Promise<void>
}

const PROPERTY_LABELS: Record<PropertyType, string> = {
  apartment: 'Apartment',
  villa: 'Villa',
  townhouse: 'Townhouse',
  commercial: 'Commercial',
  other: 'Other',
}

export function ListingForm({
  initial,
  existingImageUrls = [],
  submitLabel,
  busyLabel,
  requireImages = false,
  onSubmit,
}: Props) {
  const [values, setValues] = useState<ListingFormValues>(initial)
  const [photos, setPhotos] = useState<GalleryPhoto[]>(() => galleryFromUrls(existingImageUrls))
  const [errors, setErrors] = useState<ListingFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<UploadProgress | null>(null)

  useEffect(() => {
    return () => {
      revokeGalleryPreviews(photos)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revoke only on unmount
  }, [])

  function update<K extends keyof ListingFormValues>(key: K, value: ListingFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    setProgress(null)

    const nextErrors = validateListingForm(values, {
      requireImages,
      imageCount: photos.length,
    })
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const ordered: OrderedListingImage[] = photos.map((photo) =>
      photo.kind === 'existing'
        ? { kind: 'existing', url: photo.url }
        : { kind: 'new', file: photo.file },
    )

    setBusy(true)
    try {
      await onSubmit(values, ordered, setProgress)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong')
      setProgress(null)
    } finally {
      setBusy(false)
    }
  }

  const progressLabel =
    progress?.phase === 'compressing'
      ? `Compressing ${progress.current}/${progress.total}${progress.fileName ? `: ${progress.fileName}` : ''}…`
      : progress?.phase === 'uploading'
        ? `Uploading ${progress.current}/${progress.total}${progress.fileName ? `: ${progress.fileName}` : ''}…`
        : progress?.phase === 'validating'
          ? 'Checking photos…'
          : progress?.phase === 'done'
            ? 'Finishing…'
            : busyLabel

  return (
    <form className="listing-form glass-panel overflow-hidden rounded-2xl" onSubmit={handleSubmit} noValidate>
      <FormSection
        step="1"
        title="Basics"
        hint="What are you listing? Give buyers a clear title and description."
      >
          <FormRow label="Title" required htmlFor="listing-title" error={errors.title} hint="e.g. Sunny 3-bed villa with pool">
            <input
              id="listing-title"
              value={values.title}
              onChange={(e) => update('title', e.target.value)}
              placeholder="Enter listing title"
              maxLength={LIMITS.titleMax}
              className="form-control"
              autoComplete="off"
            />
          </FormRow>
          <FormRow
            label="Description"
            required
            htmlFor="listing-description"
            error={errors.description}
            hint={`${LIMITS.descriptionMin}–${LIMITS.descriptionMax} characters — mention size, finishes, and nearby landmarks.`}
          >
            <textarea
              id="listing-description"
              rows={5}
              value={values.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="Describe the property…"
              maxLength={LIMITS.descriptionMax}
              className="form-control min-h-[120px] resize-y"
            />
          </FormRow>
      </FormSection>

      <FormSection
        step="2"
        title="Sale or rent"
        hint="Choose how this listing is offered, then set the price."
      >
          <FormRow label="Listing for" required error={errors.listing_type}>
            <div className="listing-type-toggle" role="radiogroup" aria-label="Listing for">
              <label className={`listing-type-option ${values.listing_type === 'sale' ? 'is-active' : ''}`}>
                <input
                  type="radio"
                  name="listing_type"
                  checked={values.listing_type === 'sale'}
                  onChange={() => update('listing_type', 'sale')}
                />
                <span className="listing-type-option-title">Sell</span>
                <span className="listing-type-option-sub">One-time sale price</span>
              </label>
              <label className={`listing-type-option ${values.listing_type === 'rent' ? 'is-active' : ''}`}>
                <input
                  type="radio"
                  name="listing_type"
                  checked={values.listing_type === 'rent'}
                  onChange={() => update('listing_type', 'rent' as ListingType)}
                />
                <span className="listing-type-option-title">Rent</span>
                <span className="listing-type-option-sub">Monthly rental price</span>
              </label>
            </div>
          </FormRow>
          <div className="form-grid-2">
            <FormRow
              label={values.listing_type === 'rent' ? 'Price per month' : 'Price'}
              required
              htmlFor="listing-price"
              error={errors.price}
              hint="USD, numbers only"
            >
              <div className="form-affix">
                <span className="form-affix-prefix" aria-hidden>
                  $
                </span>
                <input
                  id="listing-price"
                  type="number"
                  min="1"
                  step="1"
                  value={values.price}
                  onChange={(e) => update('price', e.target.value)}
                  placeholder="0"
                  className="form-control form-control--affixed"
                />
              </div>
            </FormRow>
            <FormRow label="Property type" required htmlFor="listing-property-type" error={errors.property_type}>
              <select
                id="listing-property-type"
                value={values.property_type}
                onChange={(e) => update('property_type', e.target.value as PropertyType)}
                className="form-control"
              >
                {PROPERTY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {PROPERTY_LABELS[type]}
                  </option>
                ))}
              </select>
            </FormRow>
          </div>
      </FormSection>

      <FormSection step="3" title="Location" hint="Where is the property? City is required.">
          <div className="form-grid-2">
            <FormRow label="City" required htmlFor="listing-city" error={errors.city}>
              <input
                id="listing-city"
                value={values.city}
                onChange={(e) => update('city', e.target.value)}
                placeholder="e.g. Karachi"
                maxLength={LIMITS.cityMax}
                className="form-control"
                autoComplete="address-level2"
              />
            </FormRow>
            <FormRow label="Address" htmlFor="listing-address" hint="Street or area (optional but helpful)">
              <input
                id="listing-address"
                value={values.address}
                onChange={(e) => update('address', e.target.value)}
                placeholder="Street, neighbourhood…"
                maxLength={LIMITS.addressMax}
                className="form-control"
                autoComplete="street-address"
              />
            </FormRow>
          </div>
      </FormSection>

      <FormSection step="4" title="Property details" hint="Size and rooms — helps buyers filter listings.">
          <div className="form-grid-3">
            <FormRow label="Bedrooms" htmlFor="listing-bedrooms" error={errors.bedrooms}>
              <input
                id="listing-bedrooms"
                type="number"
                min="0"
                value={values.bedrooms}
                onChange={(e) => update('bedrooms', e.target.value)}
                className="form-control"
              />
            </FormRow>
            <FormRow label="Bathrooms" htmlFor="listing-bathrooms" error={errors.bathrooms}>
              <input
                id="listing-bathrooms"
                type="number"
                min="0"
                value={values.bathrooms}
                onChange={(e) => update('bathrooms', e.target.value)}
                className="form-control"
              />
            </FormRow>
            <FormRow label="Area (sqft)" htmlFor="listing-area" error={errors.area_sqft} hint="Optional">
              <input
                id="listing-area"
                type="number"
                min="0"
                value={values.area_sqft}
                onChange={(e) => update('area_sqft', e.target.value)}
                placeholder="—"
                className="form-control"
              />
            </FormRow>
          </div>
      </FormSection>

      <FormSection
        step="5"
        title="Photos"
        hint="Add clear photos. The first image is the cover — you can change it after uploading."
        last
      >
        <PhotoUploader
          photos={photos}
          onChange={setPhotos}
          disabled={busy}
          error={errors.images}
          onError={(message) => {
            setFormError(message)
            if (!message) setErrors((prev) => ({ ...prev, images: undefined }))
          }}
        />
      </FormSection>

      {busy && (
        <div className="space-y-2 border-t border-line px-5 py-4 md:px-8">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-ink">{progressLabel}</span>
            <span className="text-ink-soft">{progress?.percent ?? 0}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-gold transition-[width] duration-200"
              style={{ width: `${progress?.percent ?? 8}%` }}
            />
          </div>
        </div>
      )}

      {formError && (
        <p className="mx-5 mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 md:mx-8">
          {formError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-line bg-white/40 px-5 py-4 md:px-8">
        <button
          type="submit"
          disabled={busy}
          className="btn-anim rounded-xl bg-ink px-6 py-3 font-semibold text-sand disabled:opacity-60"
        >
          {busy ? progressLabel : submitLabel}
        </button>
        <p className="text-xs text-ink-soft">Fields marked * are required.</p>
      </div>
    </form>
  )
}

function FormSection({
  step,
  title,
  hint,
  children,
  last,
}: {
  step: string
  title: string
  hint: string
  children: ReactNode
  last?: boolean
}) {
  return (
    <section className={`form-section ${last ? '' : 'border-b border-line'}`}>
      <header className="form-section-head">
        <span className="form-step" aria-hidden>
          {step}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-ink sm:text-xl">{title}</h2>
          <p className="mt-0.5 text-sm text-ink-soft">{hint}</p>
        </div>
      </header>
      <div className="form-section-body">{children}</div>
    </section>
  )
}

function FormRow({
  label,
  required,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string
  required?: boolean
  htmlFor?: string
  hint?: string
  error?: string
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
        {/* Hints sit under the control so side-by-side inputs stay aligned */}
        {hint && !error && <p className="form-row-hint">{hint}</p>}
        {error && <p className="mt-1.5 text-sm text-red-700">{error}</p>}
      </div>
    </div>
  )
}
