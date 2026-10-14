/**
 * Shared payment webhook fulfillment — used by payment-webhook and mock-checkout.
 * Trust only after verifyWebhook (signature) has succeeded.
 */
import { createClient } from "jsr:@supabase/supabase-js@2"
import { logAppEvent } from "./appEvents.ts"
import { sendHoldConfirmationEmails } from "./holdEmails.ts"
import type { WebhookVerification } from "./payments.ts"

type AdminClient = ReturnType<typeof createClient>
type VerifiedWebhook = Extract<WebhookVerification, { ok: true }>

export function extractWebhookEventId(
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
export async function recordWebhookEvent(
  admin: AdminClient,
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
  console.error("[processPaymentWebhook] webhook_events", error.message)
  return true
}

export async function processVerifiedPaymentWebhook(
  admin: AdminClient,
  verified: VerifiedWebhook,
  source = "payment-webhook",
): Promise<{ ok: boolean; error?: string; skipped?: string; holdId?: string; status?: string; event?: string }> {
  const { data: hold, error: holdError } = await admin
    .from("holds")
    .select("*")
    .eq("provider_reference", verified.providerReference)
    .maybeSingle()

  if (holdError || !hold) {
    console.error(`[${source}] hold lookup`, holdError?.message)
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
      console.error(`[${source}] activate hold`, activateError.message)
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

    await logAppEvent("hold_activated", source, {
      hold_id: hold.id,
      listing_id: hold.listing_id,
      booking_id: hold.booking_id,
    })
    await logAppEvent("booking_created", source, {
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
        console.error(`[${source}] owner email missing`)
      }
    }

    return { ok: true, holdId: hold.id, status: "active" }
  }

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

    await logAppEvent("hold_failed", source, {
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

/**
 * Verify signature, record idempotency, fulfill — same path for provider webhooks and mock.
 */
export async function handleSignedPaymentWebhookBody(
  admin: AdminClient,
  req: Request,
  rawBody: string,
  source: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  // Lazy import avoids a circular module init with payments.ts helpers used by mock-checkout.
  const { getPaymentProvider } = await import("./payments.ts")
  const provider = getPaymentProvider()
  const verified = await provider.verifyWebhook(req, rawBody)
  if (!verified.ok) {
    return { status: 401, body: { error: verified.error } }
  }

  const eventId = extractWebhookEventId(verified.raw, verified.providerReference, verified.event)
  const inserted = await recordWebhookEvent(admin, provider.name, eventId, verified.raw ?? {})
  if (!inserted) {
    return { status: 200, body: { ok: true, skipped: "duplicate_event", eventId } }
  }

  const result = await processVerifiedPaymentWebhook(admin, verified, source)
  return { status: result.ok ? 200 : 400, body: result as Record<string, unknown> }
}
