import { supabase } from './supabase'

export type AppEventType =
  | 'listing_approved'
  | 'listing_rejected'
  | 'booking_created'
  | 'email_failed'
  | 'rate_limit_hit'
  | 'hold_activated'
  | 'hold_cancelled'
  | 'health_check_failed'

const SENSITIVE_KEY =
  /^(email|e-mail|phone|mobile|tel|password|token|secret|authorization|visitor_email|visitor_phone|visitor_name|full_name|html|body|message|note|card|pan)$/i

function scrubMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!meta) return {}
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(meta)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = '[Filtered]'
      continue
    }
    if (typeof value === 'string' && value.length > 500) {
      out[key] = value.slice(0, 500)
      continue
    }
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value == null
    ) {
      out[key] = value
    }
  }
  return out
}

/** Soft-fail helper — never throws; never sends PII. */
export async function logAppEvent(
  eventType: AppEventType,
  source: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await supabase.rpc('log_app_event', {
      p_event_type: eventType,
      p_source: source.slice(0, 80),
      p_metadata: scrubMeta(metadata),
    })
    if (error) {
      console.error('[appEvents]', eventType, error.message)
    }
  } catch (err) {
    console.error('[appEvents]', eventType, err)
  }
}
