import { supabase } from './supabase'
import type { Listing, ListingHoldStatus } from './types'

/** Paid holds UI is parked until the full hold stack is enabled in production. */
export const HOLDS_FEATURE_ENABLED = false

/** Hold fee is stored in platform_config.hold_fee_pkr — default shown until loaded */
export const DEFAULT_HOLD_FEE_PKR = 5000
export const HOLD_DURATION_HOURS = 48

/** Treat missing / null hold_status as not on hold — never crash the page. */
export function isListingOnHold(
  listing: Pick<Listing, 'hold_status'> | { hold_status?: ListingHoldStatus | null } | null | undefined,
): boolean {
  return listing?.hold_status === 'on_hold'
}

export type HoldStatus = 'pending_payment' | 'active' | 'expired' | 'refunded' | 'cancelled'

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

export function holdStatusLabel(status: HoldStatus): string {
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
    default:
      return status
  }
}
