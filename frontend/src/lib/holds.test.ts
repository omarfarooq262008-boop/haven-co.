import { describe, expect, it } from 'vitest'
import { HOLDS_FEATURE_ENABLED, isListingOnHold } from './holds'

describe('hold compatibility helpers', () => {
  it('keeps paid holds switched off until the full feature is enabled', () => {
    expect(HOLDS_FEATURE_ENABLED).toBe(false)
  })

  it('treats missing or null hold_status as not on hold', () => {
    expect(isListingOnHold(null)).toBe(false)
    expect(isListingOnHold(undefined)).toBe(false)
    expect(isListingOnHold({})).toBe(false)
    expect(isListingOnHold({ hold_status: undefined })).toBe(false)
    expect(isListingOnHold({ hold_status: null as unknown as undefined })).toBe(false)
    expect(isListingOnHold({ hold_status: 'none' })).toBe(false)
    expect(isListingOnHold({ hold_status: 'on_hold' })).toBe(true)
  })
})
