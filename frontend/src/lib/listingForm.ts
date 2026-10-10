import type { ListingStatus, ListingType, PropertyType } from './types'

export const PROPERTY_TYPES: PropertyType[] = [
  'apartment',
  'villa',
  'townhouse',
  'commercial',
  'other',
]

export const LISTING_TYPES: ListingType[] = ['sale', 'rent']

export const LISTING_STATUSES: ListingStatus[] = ['active', 'pending', 'sold', 'archived']

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
  status: ListingStatus
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
  status: 'active',
})

export function validateListingForm(
  values: ListingFormValues,
  options?: { requireImages?: boolean; imageCount?: number },
): ListingFormErrors {
  const errors: ListingFormErrors = {}

  if (!values.title.trim()) errors.title = 'Title is required'
  else if (values.title.trim().length < 3) errors.title = 'Title must be at least 3 characters'

  if (!values.description.trim()) errors.description = 'Description is required'
  else if (values.description.trim().length < 20) {
    errors.description = 'Description must be at least 20 characters'
  }

  const price = Number(values.price)
  if (values.price.trim() === '' || Number.isNaN(price)) errors.price = 'Enter a valid price'
  else if (price < 0) errors.price = 'Price cannot be negative'

  if (!values.city.trim()) errors.city = 'City is required'

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
    status: values.status,
  }
}

// Re-export image helpers so existing imports keep working
export {
  MAX_LISTING_PHOTOS,
  deleteListingImages,
  uploadListingImages,
  type UploadProgress,
} from './listingImages'
