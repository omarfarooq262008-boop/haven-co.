import type { ListingType, MarketSection } from './types'

export type PriceFilterInput = {
  minPrice: string
  maxPrice: string
}

/** Map `?type=` search param to Buy/Rent section (default: buy). */
export function sectionFromSearch(raw: string | null | undefined): MarketSection {
  return raw === 'rent' ? 'rent' : 'buy'
}

/** DB listing_type for a market section. */
export function listingTypeForSection(section: MarketSection): ListingType {
  return section === 'rent' ? 'rent' : 'sale'
}

/**
 * Validate min/max price filter fields before applying.
 * Returns an error message, or null when valid.
 */
export function validatePriceFilters(input: PriceFilterInput): string | null {
  const min = input.minPrice.trim() ? Number(input.minPrice) : null
  const max = input.maxPrice.trim() ? Number(input.maxPrice) : null

  if (min !== null && (Number.isNaN(min) || min < 0)) {
    return 'Min price must be a valid number'
  }
  if (max !== null && (Number.isNaN(max) || max < 0)) {
    return 'Max price must be a valid number'
  }
  if (min !== null && max !== null && min > max) {
    return 'Min price cannot be greater than max price'
  }
  return null
}

/** Whether a listing belongs on the current Buy/Rent tab. */
export function listingMatchesSection(
  listingType: ListingType | null | undefined,
  section: MarketSection,
): boolean {
  return listingTypeForSection(section) === (listingType ?? 'sale')
}
