import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { logAppEvent } from "../_shared/appEvents.ts"
import { getPaymentProvider } from "../_shared/payments.ts"
import { enforceEdgeRateLimits } from "../_shared/rateLimit.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({ error: "Service is not configured" }, 500)
    }

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ error: "Unauthorized" }, 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: "Unauthorized" }, 401)

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const limited = await enforceEdgeRateLimits({
      admin,
      req,
      scope: "cancel-hold",
      userId: user.id,
      ipMax: 40,
      ipWindowSeconds: 3600,
      userMax: 20,
      userWindowSeconds: 3600,
    })
    if (!limited.ok) return json({ error: limited.message }, limited.status)

    const body = (await req.json().catch(() => ({}))) as { holdId?: string }
    if (!body.holdId) return json({ error: "holdId is required" }, 400)

    const { data: hold, error: holdError } = await admin
      .from("holds")
      .select("*, listings!inner(id, owner_id, hold_status)")
      .eq("id", body.holdId)
      .single()

    if (holdError || !hold) return json({ error: "Hold not found" }, 404)

    const listing = hold.listings as { id: string; owner_id: string; hold_status: string }
    const isOwner = listing.owner_id === user.id
    if (!isOwner) {
      return json({ error: "Only the listing owner can cancel a hold and issue a refund" }, 403)
    }

    if (hold.status !== "active" && hold.status !== "pending_payment") {
      return json({ ok: true, skipped: `hold_already_${hold.status}` })
    }

    // Refund only when payment was captured (active). Pending unpaid holds just cancel.
    if (hold.status === "active") {
      if (!hold.provider_reference) {
        return json({ error: "Missing provider reference for refund" }, 500)
      }
      const refund = await getPaymentProvider().refund({
        providerReference: hold.provider_reference,
        amount: hold.amount,
        currency: hold.currency,
        reason: "Owner cancelled or declined the hold",
      })
      if (!refund.ok) {
        console.error("[cancel-hold] refund failed", refund.error)
        return json({ error: refund.error ?? "Refund failed" }, 502)
      }

      const { data: refunded, error: refundUpdateError } = await admin
        .from("holds")
        .update({ status: "refunded" })
        .eq("id", hold.id)
        .eq("status", "active")
        .select("id")
        .maybeSingle()

      if (refundUpdateError) {
        console.error("[cancel-hold] status update", refundUpdateError.message)
        return json({ error: refundUpdateError.message }, 500)
      }
      if (!refunded) {
        return json({ ok: true, skipped: "already_refunded" })
      }
    } else {
      await admin
        .from("holds")
        .update({ status: "cancelled" })
        .eq("id", hold.id)
        .eq("status", "pending_payment")
    }

    await admin
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", hold.booking_id)
      .in("status", ["pending", "confirmed"])

    await admin
      .from("listings")
      .update({ hold_status: "none" })
      .eq("id", hold.listing_id)
      .eq("hold_status", "on_hold")

    await logAppEvent("hold_cancelled", "cancel-hold", {
      hold_id: hold.id,
      listing_id: hold.listing_id,
      outcome: hold.status === "active" ? "refunded" : "cancelled",
    })

    return json({
      ok: true,
      holdId: hold.id,
      status: hold.status === "active" ? "refunded" : "cancelled",
    })
  } catch (err) {
    console.error("[cancel-hold]", err)
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
