/**
 * Soft-fail operational event logger for Edge Functions.
 * Writes to public.app_events via log_app_event (service role).
 * Never throws to callers; never logs emails/phones/card data.
 */

import { createClient } from "jsr:@supabase/supabase-js@2"

export type AppEventType =
  | "listing_approved"
  | "listing_rejected"
  | "booking_created"
  | "email_failed"
  | "rate_limit_hit"
  | "hold_activated"
  | "hold_cancelled"
  | "health_check_failed"
  | "account_deleted"
  | "listing_reported"

const SENSITIVE_KEY =
  /^(email|e-mail|phone|mobile|tel|password|token|secret|authorization|visitor_email|visitor_phone|visitor_name|full_name|html|body|message|note|card|pan)$/i

function scrubMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!meta) return {}
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(meta)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = "[Filtered]"
      continue
    }
    if (typeof value === "string" && value.length > 500) {
      out[key] = value.slice(0, 500)
      continue
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value == null) {
      out[key] = value
    } else {
      out[key] = "[object]"
    }
  }
  return out
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL")
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !key) return null
  return createClient(url, key)
}

/** Fire-and-forget safe log. Never blocks the primary flow. */
export async function logAppEvent(
  eventType: AppEventType,
  source: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const admin = adminClient()
    if (!admin) {
      console.error("[appEvents] missing Supabase env; skipped", eventType)
      return
    }
    const { error } = await admin.rpc("log_app_event", {
      p_event_type: eventType,
      p_source: source.slice(0, 80),
      p_metadata: scrubMeta(metadata),
    })
    if (error) {
      console.error("[appEvents] insert failed", eventType, error.message)
    }
  } catch (err) {
    console.error("[appEvents] unexpected", eventType, err)
  }
}
