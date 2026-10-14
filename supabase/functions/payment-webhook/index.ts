import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { logAppEvent } from "../_shared/appEvents.ts"
import { sendHoldConfirmationEmails } from "../_shared/holdEmails.ts"
import { getPaymentProvider } from "../_shared/payments.ts"
import { enforceEdgeRateLimits } from "../_shared/rateLimit.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-payment-signature",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Service is not configured" }, 500)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const limited = await enforceEdgeRateLimits({
      admin,
      req,
      scope: "payment-webhook",
      ipMax: 120,
      ipWindowSeconds: 60,
    })
    if (!limited.ok) return json({ error: limited.message }, limited.status)

    const rawBody = await req.text()
    const provider = getPaymentProvider()
    const verified = await provider.verifyWebhook(req, rawBody)
    if (!verified.ok) {
      console.error("[payment-webhook] verify failed", verified.error)
      return json({ error: verified.error }, 401)
    }

    // Idempotency via webhook_events (provider + event_id unique)
    const eventId = extractEventId(verified.raw, verified.providerReference, verified.event)
    const inserted = await recordWebhookEvent(admin, provider.name, eventId, verified.raw ?? {})
    if (!inserted) {
      return json({ ok: true, skipped: "duplicate_event", eventId })
    }

    const result = await fulfillWebhookEvent(admin, verified)
    return json(result, result.ok ? 200 : 400)
  } catch (err) {
    console.error("[payment-webhook]", err)
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500)
  }
})

function extractEventId(
  raw: unknown,
  providerReference: string,
  event: string,
): string {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>
    const id = obj.event_id ?? obj.id ?? obj.eventId
    if (typeof id === "string" && id.trim()) return id.trim()
  }
  return `${providerReference}:${event}`
}

/** Returns false if this event was already processed (unique violation). */
async function recordWebhookEvent(
  admin: ReturnType<typeof createClient>,
  provider: string,
  eventId: string,
  payload: unknown,
): Promise<boolean> {
  const { error } = await admin.from("webhook_events").insert({
    provider,
    event_id: eventId,
    payload: payload && typeof payload === "object" ? payload : { raw: payload },
  })
  if (!error) return true
  if (error.code === "23505") return false
  // Table missing in older envs — fall through and rely on hold status checks
  console.error("[payment-webhook] webhook_events", error.message)
  return true
}

async function fulfillWebhookEvent(
  admin: ReturnType<typeof createClient>,
  verified: Extract<
    Awaited<ReturnType<ReturnType<typeof getPaymentProvider>["verifyWebhook"]>>,
    { ok: true }
  >,
) {
  const { data: hold, error: holdError } = await admin
    .from("holds")
    .select("*")
    .eq("provider_reference", verified.providerReference)
    .maybeSingle()

  if (holdError || !hold) {
    console.error("[payment-webhook] hold lookup", holdError?.message)
    return { ok: false, error: "Hold not found for provider reference" }
  }

  if (verified.holdId && verified.holdId !== hold.id) {
    return { ok: false, error: "Hold id mismatch" }
  }

  if (verified.event === "payment.succeeded") {
    if (hold.status === "active") {
      return { ok: true, skipped: "already_active", holdId: hold.id }
    }
    if (hold.status !== "pending_payment") {
      return { ok: true, skipped: `hold_status_${hold.status}`, holdId: hold.id }
    }

    const paidAt = new Date().toISOString()
    const { data: activated, error: activateError } = await admin
      .from("holds")
      .update({ status: "active", paid_at: paidAt })
      .eq("id", hold.id)
      .eq("status", "pending_payment")
      .select("id")
      .maybeSingle()

    if (activateError) {
      console.error("[payment-webhook] activate hold", activateError.message)
      return { ok: false, error: activateError.message }
    }
    if (!activated) {
      return { ok: true, skipped: "concurrent_activate", holdId: hold.id }
    }

    await admin
      .from("bookings")
      .update({ status: "confirmed" })
      .eq("id", hold.booking_id)
      .eq("status", "pending")

    await admin
      .from("listings")
      .update({ hold_status: "on_hold" })
      .eq("id", hold.listing_id)

    await logAppEvent("hold_activated", "payment-webhook", {
      hold_id: hold.id,
      listing_id: hold.listing_id,
      booking_id: hold.booking_id,
    })
    await logAppEvent("booking_created", "payment-webhook", {
      booking_id: hold.booking_id,
      listing_id: hold.listing_id,
      via: "hold",
    })

    const [{ data: booking }, { data: listing }] = await Promise.all([
      admin.from("bookings").select("*").eq("id", hold.booking_id).single(),
      admin
        .from("listings")
        .select("title, address, city, owner_id")
        .eq("id", hold.listing_id)
        .single(),
    ])

    if (booking && listing) {
      const { data: ownerData } = await admin.auth.admin.getUserById(listing.owner_id)
      const ownerEmail = ownerData.user?.email
      if (ownerEmail) {
        await sendHoldConfirmationEmails({
          booking,
          listing,
          ownerEmail,
          amount: hold.amount,
          currency: hold.currency,
          expiresAt: hold.expires_at,
        })
      } else {
        console.error("[payment-webhook] owner email missing")
      }
    }

    return { ok: true, holdId: hold.id, status: "active" }
  }

  // failed / cancelled while still pending — free the slot
  if (hold.status === "pending_payment") {
    const nextStatus = verified.event === "payment.failed" ? "failed" : "cancelled"
    await admin
      .from("holds")
      .update({ status: nextStatus })
      .eq("id", hold.id)
      .eq("status", "pending_payment")

    await admin
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", hold.booking_id)
      .eq("status", "pending")

    await logAppEvent("hold_failed", "payment-webhook", {
      hold_id: hold.id,
      listing_id: hold.listing_id,
      event: verified.event,
      outcome: nextStatus,
    })
  }

  return {
    ok: true,
    holdId: hold.id,
    event: verified.event,
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
