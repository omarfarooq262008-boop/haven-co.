import { describe, expect, it } from 'vitest'
import { emptyListingForm, validateListingForm } from './listingForm'

function validForm(overrides: Partial<ReturnType<typeof emptyListingForm>> = {}) {
  return {
    ...emptyListingForm(),
    title: 'Sunny two-bed apartment',
    description: 'A comfortable home with natural light and a quiet street. Great for families.',
    price: '125000',
    city: 'Karachi',
    address: 'Clifton Block 5',
    property_type: 'apartment' as const,
    listing_type: 'sale' as const,
    bedrooms: '2',
    bathrooms: '1',
    area_sqft: '950',
    ...overrides,
  }
}

describe('validateListingForm — price and listing fields', () => {
  it('accepts a complete valid listing', () => {
    expect(validateListingForm(validForm())).toEqual({})
  })

  it('rejects missing or zero price', () => {
    expect(validateListingForm(validForm({ price: '' })).price).toMatch(/valid price/i)
    expect(validateListingForm(validForm({ price: 'abc' })).price).toMatch(/valid price/i)
    expect(validateListingForm(validForm({ price: '0' })).price).toMatch(/greater than zero/i)
    expect(validateListingForm(validForm({ price: '-10' })).price).toMatch(/greater than zero/i)
  })

  it('requires title and description length bounds', () => {
    expect(validateListingForm(validForm({ title: 'ab' })).title).toMatch(/at least/i)
    expect(validateListingForm(validForm({ description: 'too short' })).description).toMatch(
      /at least/i,
    )
  })

  it('requires city and a Sell or Rent listing type', () => {
    expect(validateListingForm(validForm({ city: '' })).city).toMatch(/required/i)
    expect(
      validateListingForm(validForm({ listing_type: 'lease' as 'sale' })).listing_type,
    ).toMatch(/Sell or Rent/i)
  })

  it('requires at least one photo when requireImages is set', () => {
    expect(validateListingForm(validForm(), { requireImages: true, imageCount: 0 }).images).toMatch(
      /photo/i,
    )
    expect(validateListingForm(validForm(), { requireImages: true, imageCount: 1 })).not.toHaveProperty(
      'images',
    )
  })
})
