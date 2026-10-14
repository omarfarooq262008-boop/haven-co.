import { supabase } from './supabase'
import type { Listing, ListingHoldStatus } from './types'

/** Paid holds are live — UI + Edge Functions + webhook trust. */
export const HOLDS_FEATURE_ENABLED = true

/** Hold fee is stored in platform_config.hold_fee_pkr — default shown until loaded */
export const DEFAULT_HOLD_FEE_PKR = 5000
export const HOLD_DURATION_HOURS = 48

/** Treat missing / null hold_status as not on hold — never crash the page. */
export function isListingOnHold(
  listing: Pick<Listing, 'hold_status'> | { hold_status?: ListingHoldStatus | null } | null | undefined,
): boolean {
  return listing?.hold_status === 'on_hold'
}

export type HoldStatus =
  | 'pending_payment'
  | 'active'
  | 'expired'
  | 'refunded'
  | 'cancelled'
  | 'failed'

export type PaymentWebhookEvent = 'payment.succeeded' | 'payment.failed' | 'payment.cancelled'

export type Hold = {
  id: string
  listing_id: string
  booking_id: string
  visitor_id: string
  amount: number
  currency: string
  status: HoldStatus
  provider: string
  provider_reference: string | null
  expires_at: string
  created_at: string
}

/**
 * Pure hold status transition for webhook events.
 * Returns the next status, or null if the event should be ignored (idempotent / terminal).
 */
export function nextHoldStatusOnWebhook(
  current: HoldStatus,
  event: PaymentWebhookEvent,
): HoldStatus | null {
  if (event === 'payment.succeeded') {
    if (current === 'pending_payment') return 'active'
    return null
  }
  if (current !== 'pending_payment') return null
  return event === 'payment.failed' ? 'failed' : 'cancelled'
}

/** Only one pending_payment or active hold is allowed per listing. */
export function canOpenHoldOnListing(
  existingOpenStatuses: Array<HoldStatus | string | null | undefined>,
): boolean {
  return !existingOpenStatuses.some((s) => s === 'pending_payment' || s === 'active')
}

/** True when this webhook event_id was already recorded. */
export function isDuplicateWebhookEvent(
  seenEventIds: Iterable<string>,
  eventId: string,
): boolean {
  const id = eventId.trim()
  if (!id) return false
  for (const seen of seenEventIds) {
    if (seen === id) return true
  }
  return false
}

/** Reject forged webhooks — signatures must match exactly (case-insensitive hex). */
export function isValidWebhookSignature(expectedHex: string, provided: string): boolean {
  const a = expectedHex.trim().toLowerCase()
  const b = provided.trim().toLowerCase()
  if (!a || !b || a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return out === 0
}

export async function fetchHoldFeePkr(): Promise<number> {
  const { data, error } = await supabase.rpc('get_hold_fee_pkr')
  if (error || data == null) {
    console.error('[holds] fee', error?.message)
    return DEFAULT_HOLD_FEE_PKR
  }
  const n = typeof data === 'number' ? data : Number(data)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_HOLD_FEE_PKR
}

export function formatHoldFee(amount: number, currency = 'PKR'): string {
  return `${new Intl.NumberFormat('en-PK').format(amount)} ${currency}`
}

export type CreateHoldCheckoutInput = {
  listingId: string
  visitor_name: string
  visitor_email: string
  visitor_phone: string
  meeting_at: string
  note: string
}

export async function createHoldCheckout(
  input: CreateHoldCheckoutInput,
): Promise<{ checkoutUrl: string } | { error: string }> {
  const { data, error } = await supabase.functions.invoke('create-hold-checkout', {
    body: input,
  })

  if (error) {
    return { error: error.message || 'Could not start hold checkout' }
  }

  const payload = data as { checkoutUrl?: string; error?: string } | null
  if (payload?.error) return { error: payload.error }
  if (!payload?.checkoutUrl) return { error: 'No checkout URL returned' }
  return { checkoutUrl: payload.checkoutUrl }
}

export async function cancelHold(holdId: string): Promise<{ ok: true } | { error: string }> {
  const { data, error } = await supabase.functions.invoke('cancel-hold', {
    body: { holdId },
  })
  if (error) return { error: error.message || 'Could not cancel hold' }
  const payload = data as { ok?: boolean; error?: string } | null
  if (payload?.error) return { error: payload.error }
  return { ok: true }
}

export async function fetchHoldStatus(
  holdId: string,
): Promise<{ status: HoldStatus } | { error: string }> {
  const { data, error } = await supabase
    .from('holds')
    .select('status')
    .eq('id', holdId)
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data?.status) return { error: 'Hold not found' }
  return { status: data.status as HoldStatus }
}

export function holdStatusLabel(status: HoldStatus | string): string {
  switch (status) {
    case 'pending_payment':
      return 'Awaiting payment'
    case 'active':
      return 'On hold'
    case 'expired':
      return 'Hold expired'
    case 'refunded':
      return 'Hold refunded'
    case 'cancelled':
      return 'Hold cancelled'
    case 'failed':
      return 'Payment failed'
    default:
      return status
  }
}

/** Human countdown until expires_at; empty when already past. */
export function holdExpiryCountdown(expiresAt: string, nowMs = Date.now()): string {
  const end = new Date(expiresAt).getTime()
  if (Number.isNaN(end)) return ''
  const ms = end - nowMs
  if (ms <= 0) return 'Expired'
  const totalMins = Math.floor(ms / 60_000)
  const hours = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  if (hours > 48) {
    const days = Math.floor(hours / 24)
    return `${days}d ${hours % 24}h left`
  }
  if (hours > 0) return `${hours}h ${mins}m left`
  return `${Math.max(1, mins)}m left`
}
