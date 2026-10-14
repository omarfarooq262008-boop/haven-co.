/**
 * Mock hosted checkout page — Pay successfully / Payment fails / Cancel.
 * Posts a signed payload to payment-webhook (same path a real provider would hit).
 * No card fields. Only active when PAYMENT_PROVIDER=mock (default).
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import {
  getPaymentProviderName,
  mockCheckoutHtml,
  signMockWebhookBody,
  getPaymentProvider,
} from "../_shared/payments.ts"
import { enforceEdgeRateLimits } from "../_shared/rateLimit.ts"

Deno.serve(async (req) => {
  const url = new URL(req.url)

  if (getPaymentProviderName() !== "mock") {
    return new Response("Mock checkout is disabled (PAYMENT_PROVIDER is not mock)", { status: 404 })
  }

  if (req.method === "GET") {
    const ref = url.searchParams.get("ref") ?? ""
    const hold = url.searchParams.get("hold") ?? ""
    if (!ref || !hold) return new Response("Missing checkout parameters", { status: 400 })

    const html = mockCheckoutHtml({
      ref,
      holdId: hold,
      amount: url.searchParams.get("amount") ?? "",
      currency: url.searchParams.get("currency") ?? "PKR",
      successUrl: url.searchParams.get("success") ?? "/",
      cancelUrl: url.searchParams.get("cancel") ?? "/",
      failureUrl: url.searchParams.get("failure") ?? "/",
      postUrl: `${url.origin}${url.pathname}`,
    })
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 })
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
    event_id: `mock_${ref}_${event}`,
    provider_reference: ref,
    hold_id: holdId,
  })
  const signature = await signMockWebhookBody(body)

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const limited = await enforceEdgeRateLimits({
    admin,
    req,
    scope: "mock-checkout",
    ipMax: 60,
    ipWindowSeconds: 60,
  })
  if (!limited.ok) return new Response(limited.message, { status: 429 })

  // Call payment-webhook internally so fulfillment uses the same verified path
  const webhookUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/payment-webhook`
  const webhookRes = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-payment-signature": signature,
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
    body,
  })

  if (!webhookRes.ok) {
    console.error("[mock-checkout] webhook failed", await webhookRes.text())
    // Still redirect — success page will poll hold status
  }

  // Also verify locally for logging
  const verified = await getPaymentProvider().verifyWebhook(
    new Request(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-payment-signature": signature },
      body,
    }),
    body,
  )
  if (!verified.ok) {
    console.error("[mock-checkout] local verify", verified.error)
  }

  return Response.redirect(redirectTo, 303)
})
