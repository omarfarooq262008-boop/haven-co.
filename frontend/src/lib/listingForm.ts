import type { ListingType, PropertyType } from './types'

export const PROPERTY_TYPES: PropertyType[] = [
  'apartment',
  'villa',
  'townhouse',
  'commercial',
  'other',
]

export const LISTING_TYPES: ListingType[] = ['sale', 'rent']

/** Keep in sync with supabase CHECK constraints */
export const LIMITS = {
  titleMin: 3,
  titleMax: 120,
  descriptionMin: 20,
  descriptionMax: 5000,
  cityMax: 80,
  addressMax: 200,
  messageMax: 2000,
  rejectionReasonMax: 500,
} as const

export type ListingFormValues = {
  title: string
  description: string
  price: string
  city: string
  address: string
  property_type: PropertyType
  listing_type: ListingType
  bedrooms: string
  bathrooms: string
  area_sqft: string
}

export type ListingFormErrors = Partial<Record<keyof ListingFormValues | 'images', string>>

export const emptyListingForm = (): ListingFormValues => ({
  title: '',
  description: '',
  price: '',
  city: '',
  address: '',
  property_type: 'apartment',
  listing_type: 'sale',
  bedrooms: '1',
  bathrooms: '1',
  area_sqft: '',
})

export function validateListingForm(
  values: ListingFormValues,
  options?: { requireImages?: boolean; imageCount?: number },
): ListingFormErrors {
  const errors: ListingFormErrors = {}
  const title = values.title.trim()
  const description = values.description.trim()
  const city = values.city.trim()
  const address = values.address.trim()

  if (!title) errors.title = 'Title is required'
  else if (title.length < LIMITS.titleMin) errors.title = `Title must be at least ${LIMITS.titleMin} characters`
  else if (title.length > LIMITS.titleMax) errors.title = `Title must be at most ${LIMITS.titleMax} characters`

  if (!description) errors.description = 'Description is required'
  else if (description.length < LIMITS.descriptionMin) {
    errors.description = `Description must be at least ${LIMITS.descriptionMin} characters`
  } else if (description.length > LIMITS.descriptionMax) {
    errors.description = `Description must be at most ${LIMITS.descriptionMax} characters`
  }

  const price = Number(values.price)
  if (values.price.trim() === '' || Number.isNaN(price)) errors.price = 'Enter a valid price'
  else if (price <= 0) errors.price = 'Price must be greater than zero'

  if (!city) errors.city = 'City is required'
  else if (city.length > LIMITS.cityMax) errors.city = `City must be at most ${LIMITS.cityMax} characters`

  if (address.length > LIMITS.addressMax) {
    errors.address = `Address must be at most ${LIMITS.addressMax} characters`
  }

  if (!PROPERTY_TYPES.includes(values.property_type)) {
    errors.property_type = 'Choose a property type'
  }

  if (!LISTING_TYPES.includes(values.listing_type)) {
    errors.listing_type = 'Choose Sell or Rent'
  }

  const beds = Number(values.bedrooms)
  if (values.bedrooms.trim() === '' || Number.isNaN(beds) || beds < 0 || !Number.isInteger(beds)) {
    errors.bedrooms = 'Enter a valid bedroom count'
  }

  const baths = Number(values.bathrooms)
  if (values.bathrooms.trim() === '' || Number.isNaN(baths) || baths < 0 || !Number.isInteger(baths)) {
    errors.bathrooms = 'Enter a valid bathroom count'
  }

  if (values.area_sqft.trim()) {
    const area = Number(values.area_sqft)
    if (Number.isNaN(area) || area < 0) errors.area_sqft = 'Enter a valid area'
  }

  if (options?.requireImages && (options.imageCount ?? 0) < 1) {
    errors.images = 'Add at least one photo'
  }

  return errors
}

export function validateMessageBody(body: string): string | null {
  const text = body.trim()
  if (!text) return 'Write a message before sending.'
  if (text.length > LIMITS.messageMax) {
    return `Message must be at most ${LIMITS.messageMax} characters.`
  }
  return null
}

export function listingPayloadFromForm(values: ListingFormValues, ownerId: string, imageUrls: string[]) {
  return {
    owner_id: ownerId,
    title: values.title.trim(),
    description: values.description.trim(),
    price: Number(values.price),
    city: values.city.trim(),
    address: values.address.trim(),
    property_type: values.property_type,
    listing_type: values.listing_type,
    bedrooms: Number(values.bedrooms),
    bathrooms: Number(values.bathrooms),
    area_sqft: values.area_sqft.trim() ? Number(values.area_sqft) : null,
    image_urls: imageUrls,
  }
}

export {
  MAX_LISTING_PHOTOS,
  deleteListingImages,
  uploadListingImages,
  type UploadProgress,
} from './listingImages'
