import { describe, expect, it } from 'vitest'
import { formatListingPrice, formatPrice, listingTypeBadge } from './format'

describe('formatPrice', () => {
  it('formats whole USD amounts without cents', () => {
    expect(formatPrice(250000)).toBe('$250,000')
    expect(formatPrice(0)).toBe('$0')
  })
})

describe('formatListingPrice', () => {
  it('appends / month for rent listings', () => {
    expect(formatListingPrice(45000, 'rent')).toBe('$45,000 / month')
  })

  it('omits / month for sale listings', () => {
    expect(formatListingPrice(45000, 'sale')).toBe('$45,000')
    expect(formatListingPrice(45000)).toBe('$45,000')
  })
})

describe('listingTypeBadge', () => {
  it('labels sale and rent', () => {
    expect(listingTypeBadge('sale')).toBe('For Sale')
    expect(listingTypeBadge('rent')).toBe('For Rent')
  })
})
