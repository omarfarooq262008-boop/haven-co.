import type { ListingType } from './types'

export function formatPrice(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatListingPrice(value: number, listingType: ListingType = 'sale') {
  const base = formatPrice(value)
  return listingType === 'rent' ? `${base} / month` : base
}

export function listingTypeBadge(listingType: ListingType = 'sale') {
  return listingType === 'rent' ? 'For Rent' : 'For Sale'
}
