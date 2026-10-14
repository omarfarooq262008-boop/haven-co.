import { describe, expect, it } from 'vitest'
import {
  HOLDS_FEATURE_ENABLED,
  canOpenHoldOnListing,
  holdExpiryCountdown,
  isDuplicateWebhookEvent,
  isListingOnHold,
  isValidWebhookSignature,
  nextHoldStatusOnWebhook,
} from './holds'

describe('hold feature flag', () => {
  it('enables paid holds in the UI', () => {
    expect(HOLDS_FEATURE_ENABLED).toBe(true)
  })
})

describe('isListingOnHold', () => {
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

describe('hold state machine', () => {
  it('activates pending holds on payment.succeeded', () => {
    expect(nextHoldStatusOnWebhook('pending_payment', 'payment.succeeded')).toBe('active')
  })

  it('is idempotent when already active', () => {
    expect(nextHoldStatusOnWebhook('active', 'payment.succeeded')).toBeNull()
  })

  it('marks pending holds failed or cancelled on non-success', () => {
    expect(nextHoldStatusOnWebhook('pending_payment', 'payment.failed')).toBe('failed')
    expect(nextHoldStatusOnWebhook('pending_payment', 'payment.cancelled')).toBe('cancelled')
  })

  it('ignores failure events after terminal states', () => {
    expect(nextHoldStatusOnWebhook('active', 'payment.failed')).toBeNull()
    expect(nextHoldStatusOnWebhook('refunded', 'payment.cancelled')).toBeNull()
    expect(nextHoldStatusOnWebhook('expired', 'payment.succeeded')).toBeNull()
  })
})

describe('webhook idempotency', () => {
  it('detects duplicate event ids', () => {
    const seen = new Set(['evt_1', 'evt_2'])
    expect(isDuplicateWebhookEvent(seen, 'evt_1')).toBe(true)
    expect(isDuplicateWebhookEvent(seen, 'evt_3')).toBe(false)
  })

  it('rejects a forged webhook signature', () => {
    const expected = 'abcdef0123456789'
    expect(isValidWebhookSignature(expected, expected)).toBe(true)
    expect(isValidWebhookSignature(expected, 'deadbeef01234567')).toBe(false)
    expect(isValidWebhookSignature(expected, '')).toBe(false)
    expect(isValidWebhookSignature(expected, 'short')).toBe(false)
  })
})

describe('one open hold per listing', () => {
  it('blocks a second pending or active hold', () => {
    expect(canOpenHoldOnListing([])).toBe(true)
    expect(canOpenHoldOnListing(['expired', 'refunded'])).toBe(true)
    expect(canOpenHoldOnListing(['pending_payment'])).toBe(false)
    expect(canOpenHoldOnListing(['active'])).toBe(false)
    expect(canOpenHoldOnListing(['cancelled', 'active'])).toBe(false)
  })
})

describe('holdExpiryCountdown', () => {
  it('formats remaining time', () => {
    const now = Date.parse('2026-01-01T12:00:00Z')
    expect(holdExpiryCountdown('2026-01-01T14:30:00Z', now)).toBe('2h 30m left')
    expect(holdExpiryCountdown('2026-01-01T11:00:00Z', now)).toBe('Expired')
  })
})
