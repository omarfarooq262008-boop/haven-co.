import { describe, expect, it } from 'vitest'
import { friendlyError } from './errors'

describe('friendlyError — rate-limit mapping', () => {
  it('maps message rate limits', () => {
    expect(friendlyError('Please wait a moment before sending another message', 'x')).toBe(
      'Please wait a moment before sending another message.',
    )
    expect(friendlyError('rate limit on message send', 'x')).toBe(
      'Please wait a moment before sending another message.',
    )
  })

  it('maps listing-per-day limits', () => {
    expect(friendlyError('You may create at most 10 new listings per day', 'x')).toBe(
      "You've reached the limit of 10 new listings per day. Please try again tomorrow.",
    )
  })

  it('maps booking limits', () => {
    expect(friendlyError('booking limit exceeded for visitor', 'x')).toBe(
      "You've booked too many meetings recently. Please try again in a bit.",
    )
  })

  it('maps generic 429 / too-many-requests', () => {
    expect(friendlyError('Too many requests from this network', 'x')).toBe(
      "You're doing that too often. Please wait a moment and try again.",
    )
    expect(friendlyError('HTTP 429', 'x')).toBe(
      "You're doing that too often. Please wait a moment and try again.",
    )
  })

  it('maps auth email rate limits', () => {
    expect(friendlyError('over_email_send_rate_limit', 'x')).toBe(
      'Too many login attempts. Please wait a minute and try again.',
    )
  })

  it('falls back when message is empty or opaque', () => {
    expect(friendlyError('', 'Fallback')).toBe('Fallback')
    expect(friendlyError(null, 'Fallback')).toBe('Fallback')
  })
})
