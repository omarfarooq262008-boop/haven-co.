import { describe, expect, it } from 'vitest'
import {
  isMockCheckoutDoubleClickIdempotent,
  isMockCheckoutEndpointAllowed,
  safeMockPaymentRedirect,
  validateMockCheckoutHold,
} from './mockCheckout'

describe('mock checkout endpoint gate', () => {
  it('refuses when PAYMENT_PROVIDER is not mock', () => {
    expect(isMockCheckoutEndpointAllowed('mock')).toBe(true)
    expect(isMockCheckoutEndpointAllowed('MOCK')).toBe(true)
    expect(isMockCheckoutEndpointAllowed('safepay')).toBe(false)
    expect(isMockCheckoutEndpointAllowed('payfast')).toBe(false)
    expect(isMockCheckoutEndpointAllowed('')).toBe(false)
  })
})

describe('mock checkout ref validation', () => {
  it('rejects a wrong ref', () => {
    const hold = {
      id: 'hold-1',
      status: 'pending_payment',
      provider_reference: 'mock_abc',
    }
    expect(validateMockCheckoutHold({ hold, ref: 'mock_abc' })).toEqual({ ok: true })
    expect(validateMockCheckoutHold({ hold, ref: 'forged_ref' })).toEqual({
      ok: false,
      error: 'Wrong or mismatched payment reference',
      status: 403,
    })
  })

  it('rejects missing hold', () => {
    expect(validateMockCheckoutHold({ hold: null, ref: 'mock_abc' })).toEqual({
      ok: false,
      error: 'Hold not found',
      status: 404,
    })
  })
})

describe('mock checkout double-click idempotency', () => {
  it('treats a second click after success as idempotent', () => {
    expect(
      isMockCheckoutDoubleClickIdempotent({
        firstOutcome: 'success',
        holdStatusAfterFirst: 'active',
        secondCallHoldStatus: 'active',
      }),
    ).toBe(true)

    const afterSuccess = validateMockCheckoutHold({
      hold: { id: 'h1', status: 'active', provider_reference: 'mock_x' },
      ref: 'mock_x',
    })
    expect(afterSuccess).toEqual({ ok: true })
  })

  it('treats a second click after failure as idempotent', () => {
    expect(
      isMockCheckoutDoubleClickIdempotent({
        firstOutcome: 'failed',
        holdStatusAfterFirst: 'failed',
        secondCallHoldStatus: 'failed',
      }),
    ).toBe(true)
  })
})

describe('safeMockPaymentRedirect', () => {
  const origin = 'https://haven.example'

  it('uses same-origin payment paths and ignores external URLs', () => {
    expect(
      safeMockPaymentRedirect({
        action: 'succeed',
        holdId: 'h1',
        candidateUrl: 'https://evil.example/phish',
        siteOrigin: origin,
      }),
    ).toBe('/payment/success?hold=h1')

    expect(
      safeMockPaymentRedirect({
        action: 'fail',
        holdId: 'h1',
        candidateUrl: 'https://haven.example/payment/failed?hold=h1',
        siteOrigin: origin,
      }),
    ).toBe('/payment/failed?hold=h1')

    expect(
      safeMockPaymentRedirect({
        action: 'cancel',
        holdId: 'h1',
        candidateUrl: null,
        siteOrigin: origin,
      }),
    ).toBe('/payment/cancelled?hold=h1')
  })
})
