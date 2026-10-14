/**
 * Mock checkout JSON API — used only when PAYMENT_PROVIDER=mock.
 * Frontend /mock-checkout POSTs { ref, hold, action }; this function signs a
 * webhook payload with PAYMENT_WEBHOOK_SECRET (never sent to the browser) and
 * runs the same fulfillment path as payment-webhook.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import {
  getPaymentProviderName,
  signMockWebhookBody,
} from "../_shared/payments.ts"
import { handleSignedPaymentWebhookBody } from "../_shared/processPaymentWebhook.ts"
import { enforceEdgeRateLimits } from "../_shared/rateLimit.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type Action = "succeed" | "fail" | "cancel"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (getPaymentProviderName() !== "mock") {
    return json({ error: "Mock checkout is disabled (PAYMENT_PROVIDER is not mock)" }, 404)
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed. Use POST with JSON { ref, hold, action }." }, 405)
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
      scope: "mock-checkout",
      ipMax: 60,
      ipWindowSeconds: 60,
    })
    if (!limited.ok) return json({ error: limited.message }, limited.status)

    const body = (await req.json().catch(() => null)) as {
      ref?: string
      hold?: string
      action?: string
    } | null

    if (!body || typeof body !== "object") {
      return json({ error: "Invalid JSON body. Expected { ref, hold, action }." }, 400)
    }

    const ref = String(body.ref ?? "").trim()
    const holdId = String(body.hold ?? "").trim()
    const actionRaw = String(body.action ?? "").trim().toLowerCase()
    const action: Action | null =
      actionRaw === "succeed" || actionRaw === "fail" || actionRaw === "cancel"
        ? actionRaw
        : null

    if (!ref || !holdId || !action) {
      return json({
        error: "ref, hold, and action (succeed|fail|cancel) are required",
      }, 400)
    }

    const { data: hold, error: holdError } = await admin
      .from("holds")
      .select("id, status, provider_reference")
      .eq("id", holdId)
      .maybeSingle()

    if (holdError) {
      console.error("[mock-checkout] hold lookup", holdError.message)
      return json({ error: "Could not load hold" }, 500)
    }
    if (!hold) {
      return json({ error: "Hold not found" }, 404)
    }
    if (hold.status !== "pending_payment") {
      // Idempotent: already processed (e.g. double-click)
      if (hold.status === "active" || hold.status === "failed" || hold.status === "cancelled") {
        return json({
          ok: true,
          skipped: `hold_already_${hold.status}`,
          holdId: hold.id,
          outcome: hold.status === "active" ? "success" : hold.status === "failed" ? "failed" : "cancelled",
        })
      }
      return json({ error: `Hold is not awaiting payment (status: ${hold.status})` }, 409)
    }
    if (!hold.provider_reference || hold.provider_reference !== ref) {
      return json({ error: "Wrong or mismatched payment reference" }, 403)
    }

    const event =
      action === "succeed"
        ? "payment.succeeded"
        : action === "fail"
          ? "payment.failed"
          : "payment.cancelled"

    const payload = JSON.stringify({
      event,
      event_id: `mock_${ref}_${event}`,
      provider_reference: ref,
      hold_id: holdId,
    })
    const signature = await signMockWebhookBody(payload)

    const signedReq = new Request(req.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-payment-signature": signature,
      },
      body: payload,
    })

    const result = await handleSignedPaymentWebhookBody(
      admin,
      signedReq,
      payload,
      "mock-checkout",
    )

    const outcome =
      action === "succeed" ? "success" : action === "fail" ? "failed" : "cancelled"

    if (result.status >= 400 && !result.body.skipped) {
      return json(
        {
          error: (result.body.error as string) ?? "Could not process mock payment",
          ...result.body,
        },
        result.status,
      )
    }

    return json({
      ok: true,
      outcome,
      holdId,
      ...result.body,
    })
  } catch (err) {
    console.error("[mock-checkout]", err)
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
