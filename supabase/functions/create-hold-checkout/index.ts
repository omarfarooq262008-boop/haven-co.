import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { enforceEdgeRateLimits } from "../_shared/rateLimit.ts"
import { appUrl, getPaymentProvider } from "../_shared/payments.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const HOLD_HOURS = 48

type Body = {
  listingId?: string
  visitor_name?: string
  visitor_email?: string
  visitor_phone?: string
  meeting_at?: string
  note?: string
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
      scope: "create-hold-checkout",
      userId: user.id,
      ipMax: 30,
      ipWindowSeconds: 3600,
      userMax: 8,
      userWindowSeconds: 3600,
    })
    if (!limited.ok) return json({ error: limited.message }, limited.status)

    const body = (await req.json().catch(() => ({}))) as Body
    if (!body.listingId) return json({ error: "listingId is required" }, 400)
    if (!body.meeting_at) return json({ error: "meeting_at is required" }, 400)

    const name = (body.visitor_name ?? "").trim()
    const email = (body.visitor_email ?? "").trim()
    const phone = (body.visitor_phone ?? "").trim()
    const note = (body.note ?? "").trim()

    if (!name || name.length > 120) return json({ error: "Invalid name" }, 400)
    if (!email || email.length > 254 || !email.includes("@")) {
      return json({ error: "Invalid email" }, 400)
    }
    if (!phone || phone.length < 3 || phone.length > 40) {
      return json({ error: "Invalid phone" }, 400)
    }
    if (note.length > 1000) return json({ error: "Note is too long" }, 400)

    const meetingAt = new Date(body.meeting_at)
    if (Number.isNaN(meetingAt.getTime()) || meetingAt.getTime() <= Date.now()) {
      return json({ error: "Meeting must be in the future" }, 400)
    }

    const { data: listing, error: listingError } = await admin
      .from("listings")
      .select("id, title, owner_id, status, hold_status, address, city")
      .eq("id", body.listingId)
      .single()

    if (listingError || !listing) return json({ error: "Listing not found" }, 404)
    if (listing.status !== "approved") {
      return json({ error: "Listing is not available for holds" }, 400)
    }
    if (listing.hold_status === "on_hold") {
      return json({ error: "This property is already on hold" }, 409)
    }
    if (listing.owner_id === user.id) {
      return json({ error: "Owners cannot hold their own listing" }, 400)
    }

    const { data: openHold } = await admin
      .from("holds")
      .select("id")
      .eq("listing_id", listing.id)
      .in("status", ["pending_payment", "active"])
      .maybeSingle()

    if (openHold) {
      return json({ error: "This property already has an open hold" }, 409)
    }

    const { data: feeRaw, error: feeError } = await admin.rpc("get_hold_fee_pkr")
    if (feeError) {
      console.error("[create-hold-checkout] fee", feeError.message)
      return json({ error: "Could not load hold fee" }, 500)
    }
    const amount = typeof feeRaw === "number" ? feeRaw : Number(feeRaw)
    if (!Number.isFinite(amount) || amount < 1) {
      return json({ error: "Invalid hold fee configuration" }, 500)
    }
    const currency = "PKR"

    const expiresAt = new Date(
      Math.min(Date.now() + HOLD_HOURS * 60 * 60 * 1000, meetingAt.getTime()),
    )

    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .insert({
        listing_id: listing.id,
        owner_id: listing.owner_id,
        visitor_id: user.id,
        visitor_name: name,
        visitor_email: email,
        visitor_phone: phone,
        meeting_at: meetingAt.toISOString(),
        note,
        status: "pending",
      })
      .select("id")
      .single()

    if (bookingError || !booking) {
      console.error("[create-hold-checkout] booking", bookingError?.message)
      if (bookingError?.code === "23505") {
        return json({ error: "That time slot was just taken. Choose another." }, 409)
      }
      return json({ error: bookingError?.message ?? "Could not create booking" }, 400)
    }

    const { data: hold, error: holdError } = await admin
      .from("holds")
      .insert({
        listing_id: listing.id,
        booking_id: booking.id,
        visitor_id: user.id,
        amount,
        currency,
        status: "pending_payment",
        provider: getPaymentProvider().name,
        expires_at: expiresAt.toISOString(),
      })
      .select("id")
      .single()

    if (holdError || !hold) {
      console.error("[create-hold-checkout] hold", holdError?.message)
      await admin.from("bookings").update({ status: "cancelled" }).eq("id", booking.id)
      if (holdError?.code === "23505") {
        return json({ error: "This property already has an open hold" }, 409)
      }
      return json({ error: holdError?.message ?? "Could not create hold" }, 400)
    }

    const base = appUrl()
    const successUrl = `${base}/payment/result?status=success&hold=${hold.id}`
    const cancelUrl = `${base}/payment/result?status=cancelled&hold=${hold.id}`
    const failureUrl = `${base}/payment/result?status=failed&hold=${hold.id}`

    let checkout
    try {
      checkout = await getPaymentProvider().createCheckout({
        holdId: hold.id,
        amount,
        currency,
        description: `Hold: ${listing.title}`,
        customerEmail: email,
        successUrl,
        cancelUrl,
        failureUrl,
      })
    } catch (err) {
      console.error("[create-hold-checkout] checkout", err)
      await admin.from("holds").update({ status: "cancelled" }).eq("id", hold.id)
      await admin.from("bookings").update({ status: "cancelled" }).eq("id", booking.id)
      return json({
        error: err instanceof Error ? err.message : "Could not start checkout",
      }, 502)
    }

    const { error: refError } = await admin
      .from("holds")
      .update({
        provider: checkout.provider,
        provider_reference: checkout.providerReference,
      })
      .eq("id", hold.id)

    if (refError) {
      console.error("[create-hold-checkout] provider_reference", refError.message)
    }

    return json({
      ok: true,
      checkoutUrl: checkout.checkoutUrl,
      holdId: hold.id,
      bookingId: booking.id,
      amount,
      currency,
      expiresAt: expiresAt.toISOString(),
    })
  } catch (err) {
    console.error("[create-hold-checkout]", err)
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
