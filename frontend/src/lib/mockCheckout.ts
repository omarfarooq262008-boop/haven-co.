import { supabase } from './supabase'
import { formatHoldFee } from './holds'

export type MockCheckoutAction = 'succeed' | 'fail' | 'cancel'

/** Mirrors Edge Function: only active when PAYMENT_PROVIDER is mock. */
export function isMockCheckoutEndpointAllowed(paymentProvider: string): boolean {
  return paymentProvider.trim().toLowerCase() === 'mock'
}

/**
 * Hold must be pending_payment and provider_reference must match ref.
 * Returns a clear error code for the UI / tests.
 */
export function validateMockCheckoutHold(opts: {
  hold: { id: string; status: string; provider_reference: string | null } | null
  ref: string
}): { ok: true } | { ok: false; error: string; status: number } {
  if (!opts.hold) return { ok: false, error: 'Hold not found', status: 404 }
  if (opts.hold.status !== 'pending_payment') {
    if (
      opts.hold.status === 'active' ||
      opts.hold.status === 'failed' ||
      opts.hold.status === 'cancelled'
    ) {
      // Double-click / already processed — idempotent skip
      return { ok: true }
    }
    return {
      ok: false,
      error: `Hold is not awaiting payment (status: ${opts.hold.status})`,
      status: 409,
    }
  }
  if (!opts.hold.provider_reference || opts.hold.provider_reference !== opts.ref.trim()) {
    return { ok: false, error: 'Wrong or mismatched payment reference', status: 403 }
  }
  return { ok: true }
}

/** Idempotent: second identical mock event should be treated as a no-op success. */
export function isMockCheckoutDoubleClickIdempotent(opts: {
  firstOutcome: 'success' | 'failed' | 'cancelled'
  holdStatusAfterFirst: string
  secondCallHoldStatus: string
}): boolean {
  if (opts.firstOutcome === 'success') {
    return opts.holdStatusAfterFirst === 'active' && opts.secondCallHoldStatus === 'active'
  }
  if (opts.firstOutcome === 'failed') {
    return opts.holdStatusAfterFirst === 'failed' && opts.secondCallHoldStatus === 'failed'
  }
  return opts.holdStatusAfterFirst === 'cancelled' && opts.secondCallHoldStatus === 'cancelled'
}

/**
 * Only allow redirects on the same origin as the current site (APP_URL / window origin).
 * Ignores any external success/cancel/failure URL (open-redirect protection).
 */
export function safeMockPaymentRedirect(opts: {
  action: MockCheckoutAction
  holdId: string
  candidateUrl?: string | null
  siteOrigin: string
}): string {
  const fallbackPath =
    opts.action === 'succeed'
      ? `/payment/success?hold=${encodeURIComponent(opts.holdId)}`
      : opts.action === 'fail'
        ? `/payment/failed?hold=${encodeURIComponent(opts.holdId)}`
        : `/payment/cancelled?hold=${encodeURIComponent(opts.holdId)}`

  const candidate = (opts.candidateUrl ?? '').trim()
  if (!candidate) return fallbackPath

  try {
    const site = new URL(opts.siteOrigin)
    const target = new URL(candidate, site.origin)
    if (target.origin !== site.origin) return fallbackPath
    // Only allow our payment result paths
    if (!/^\/payment\/(success|failed|cancelled|result)\/?$/.test(target.pathname)) {
      return fallbackPath
    }
    if (!target.searchParams.get('hold') && opts.holdId) {
      target.searchParams.set('hold', opts.holdId)
    }
    return `${target.pathname}${target.search}`
  } catch {
    return fallbackPath
  }
}

export function parseMockCheckoutQuery(searchParams: URLSearchParams): {
  holdId: string
  ref: string
  amount: string
  currency: string
  successUrl: string
  cancelUrl: string
  failureUrl: string
} {
  return {
    holdId: (searchParams.get('hold') ?? '').trim(),
    ref: (searchParams.get('ref') ?? '').trim(),
    amount: (searchParams.get('amount') ?? '').trim(),
    currency: (searchParams.get('currency') ?? 'PKR').trim() || 'PKR',
    successUrl: (searchParams.get('success') ?? '').trim(),
    cancelUrl: (searchParams.get('cancel') ?? '').trim(),
    failureUrl: (searchParams.get('failure') ?? '').trim(),
  }
}

export function displayMockAmount(amount: string, currency: string): string {
  const n = Number(amount)
  if (Number.isFinite(n) && n > 0) return formatHoldFee(n, currency || 'PKR')
  return amount ? `${amount} ${currency || 'PKR'}` : `— ${currency || 'PKR'}`
}

/** Call the mock-checkout Edge Function (JSON only). Secret stays server-side. */
export async function submitMockCheckout(opts: {
  ref: string
  hold: string
  action: MockCheckoutAction
}): Promise<{ ok: true; outcome: string } | { ok: false; error: string; status?: number }> {
  const { data, error } = await supabase.functions.invoke('mock-checkout', {
    body: { ref: opts.ref, hold: opts.hold, action: opts.action },
  })

  if (error) {
    return { ok: false, error: error.message || 'Mock checkout request failed' }
  }

  const payload = data as {
    ok?: boolean
    outcome?: string
    error?: string
    skipped?: string
  } | null

  if (payload?.error && !payload.ok && !payload.skipped) {
    return { ok: false, error: payload.error }
  }

  const outcome =
    payload?.outcome ??
    (opts.action === 'succeed' ? 'success' : opts.action === 'fail' ? 'failed' : 'cancelled')

  return { ok: true, outcome }
}
