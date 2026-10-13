import { describe, expect, it } from 'vitest'
import {
  listingMatchesSection,
  listingTypeForSection,
  sectionFromSearch,
  validatePriceFilters,
} from './marketFilters'

describe('Buy/Rent filtering', () => {
  it('defaults unknown type params to buy / sale', () => {
    expect(sectionFromSearch(null)).toBe('buy')
    expect(sectionFromSearch('')).toBe('buy')
    expect(sectionFromSearch('sale')).toBe('buy')
    expect(sectionFromSearch('rent')).toBe('rent')
    expect(listingTypeForSection('buy')).toBe('sale')
    expect(listingTypeForSection('rent')).toBe('rent')
  })

  it('matches listings to the active section', () => {
    expect(listingMatchesSection('sale', 'buy')).toBe(true)
    expect(listingMatchesSection('rent', 'buy')).toBe(false)
    expect(listingMatchesSection('rent', 'rent')).toBe(true)
    expect(listingMatchesSection(undefined, 'buy')).toBe(true)
  })

  it('validates min/max price filter ranges', () => {
    expect(validatePriceFilters({ minPrice: '', maxPrice: '' })).toBeNull()
    expect(validatePriceFilters({ minPrice: '100', maxPrice: '500' })).toBeNull()
    expect(validatePriceFilters({ minPrice: '-1', maxPrice: '' })).toMatch(/Min price/i)
    expect(validatePriceFilters({ minPrice: '', maxPrice: 'nope' })).toMatch(/Max price/i)
    expect(validatePriceFilters({ minPrice: '900', maxPrice: '100' })).toMatch(
      /greater than max/i,
    )
  })
})
