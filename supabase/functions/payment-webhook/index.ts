import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { sendHoldConfirmationEmails } from "../_shared/holdEmails.ts"
import {
  getPaymentProvider,
  mockCheckoutHtml,
  signMockWebhookBody,
} from "../_shared/payments.ts"
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

  const url = new URL(req.url)

  // Mock hosted checkout page (no card fields)
  if (req.method === "GET" && url.searchParams.get("mock_checkout") === "1") {
    return serveMockCheckout(url)
  }

  // Mock checkout form POST → signed internal webhook fulfillment
  if (req.method === "POST" && url.searchParams.get("mock_checkout") === "1") {
    return handleMockCheckoutPost(req)
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

    const result = await fulfillWebhookEvent(admin, verified)
    return json(result, result.ok ? 200 : 400)
  } catch (err) {
    console.error("[payment-webhook]", err)
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500)
  }
})

function serveMockCheckout(url: URL) {
  if (getPaymentProvider().name !== "mock") {
    return new Response("Mock checkout is disabled", { status: 404 })
  }
  const ref = url.searchParams.get("ref") ?? ""
  const hold = url.searchParams.get("hold") ?? ""
  if (!ref || !hold) {
    return new Response("Missing checkout parameters", { status: 400 })
  }
  const html = mockCheckoutHtml({
    ref,
    holdId: hold,
    amount: url.searchParams.get("amount") ?? "",
    currency: url.searchParams.get("currency") ?? "PKR",
    successUrl: url.searchParams.get("success") ?? "/",
    cancelUrl: url.searchParams.get("cancel") ?? "/",
    failureUrl: url.searchParams.get("failure") ?? "/",
    postUrl: `${url.origin}${url.pathname}?mock_checkout=1`,
  })
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}

async function handleMockCheckoutPost(req: Request) {
  if (getPaymentProvider().name !== "mock") {
    return new Response("Mock checkout is disabled", { status: 404 })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Not configured", { status: 500 })
  }

  const form = await req.formData()
  const action = String(form.get("action") ?? "")
  const ref = String(form.get("ref") ?? "")
  const holdId = String(form.get("hold") ?? "")
  const successUrl = String(form.get("success") ?? "/")
  const cancelUrl = String(form.get("cancel") ?? "/")
  const failureUrl = String(form.get("failure") ?? "/")

  const event =
    action === "succeed"
      ? "payment.succeeded"
      : action === "fail"
        ? "payment.failed"
        : "payment.cancelled"

  const redirectTo =
    event === "payment.succeeded"
      ? successUrl
      : event === "payment.failed"
        ? failureUrl
        : cancelUrl

  const body = JSON.stringify({
    event,
    provider_reference: ref,
    hold_id: holdId,
  })
  const signature = await signMockWebhookBody(body)

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const limited = await enforceEdgeRateLimits({
    admin,
    req,
    scope: "payment-webhook",
    ipMax: 120,
    ipWindowSeconds: 60,
  })
  if (!limited.ok) {
    return new Response(limited.message, { status: 429 })
  }

  // Fulfill server-side with the same verifyWebhook path (signature trusted here)
  const verified = await getPaymentProvider().verifyWebhook(
    new Request(req.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-payment-signature": signature,
      },
      body,
    }),
    body,
  )

  if (!verified.ok) {
    console.error("[payment-webhook] mock verify", verified.error)
    return Response.redirect(failureUrl, 303)
  }

  await fulfillWebhookEvent(admin, verified)
  return Response.redirect(redirectTo, 303)
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

  // Idempotent: already active / terminal
  if (verified.event === "payment.succeeded") {
    if (hold.status === "active") {
      return { ok: true, skipped: "already_active", holdId: hold.id }
    }
    if (hold.status !== "pending_payment") {
      return { ok: true, skipped: `hold_status_${hold.status}`, holdId: hold.id }
    }

    const { data: activated, error: activateError } = await admin
      .from("holds")
      .update({ status: "active" })
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

  // failed / cancelled while still pending — free the slot, do not mark listing on hold
  if (hold.status === "pending_payment") {
    await admin
      .from("holds")
      .update({ status: "cancelled" })
      .eq("id", hold.id)
      .eq("status", "pending_payment")

    await admin
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", hold.booking_id)
      .eq("status", "pending")
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
