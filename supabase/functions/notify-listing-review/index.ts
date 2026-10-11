import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2"
import { enforceEdgeRateLimits } from "../_shared/rateLimit.ts"

type ListingRecord = {
  id?: string
  owner_id?: string
  title?: string
  city?: string
  price?: number | string
  status?: string
  rejection_reason?: string | null
  listing_type?: string | null
}

type WebhookPayload = {
  type?: string
  table?: string
  schema?: string
  record?: ListingRecord | null
  old_record?: ListingRecord | null
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return json({ ok: true })
  }

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY")
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL")
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const webhookSecret = Deno.env.get("LISTING_REVIEW_WEBHOOK_SECRET")
    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "")

    if (!resendKey || !fromEmail || !supabaseUrl || !serviceRoleKey) {
      console.error("[notify-listing-review] Missing Resend or Supabase secrets")
      // Do not fail the listing write path; webhook is already post-commit.
      return json({ ok: true, skipped: "email_not_configured" })
    }

    if (!webhookSecret) {
      console.error("[notify-listing-review] LISTING_REVIEW_WEBHOOK_SECRET is not set")
      return json({ ok: true, skipped: "webhook_secret_missing" })
    }

    const provided =
      req.headers.get("x-webhook-secret") ??
      req.headers.get("X-Webhook-Secret") ??
      ""
    if (provided !== webhookSecret) {
      return json({ error: "Unauthorized" }, 401)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const payload = (await req.json().catch(() => null)) as WebhookPayload | null

    if (!payload || payload.table !== "listings") {
      return json({ ok: true, skipped: "not a listings event" })
    }

    const record = payload.record
    if (!record?.id || !record.owner_id) {
      return json({ ok: true, skipped: "invalid listing payload" })
    }

    const limited = await enforceEdgeRateLimits({
      admin,
      req,
      scope: "notify-listing-review",
      userId: record.owner_id,
      ipMax: 120,
      ipWindowSeconds: 60,
      userMax: 40,
      userWindowSeconds: 3600,
    })
    if (!limited.ok) {
      console.warn("[notify-listing-review] rate limited", limited.message)
      return json({ ok: true, skipped: "rate_limit" })
    }

    if (!appUrl) {
      console.warn("[notify-listing-review] APP_URL is not set; links may be incomplete")
    }

    if (payload.type === "INSERT") {
      if (record.status !== "pending") {
        return json({ ok: true, skipped: "insert_not_pending" })
      }
      const result = await emailAdminsNewListing({
        admin,
        resendKey,
        fromEmail,
        appUrl,
        listing: record,
      })
      return json({ ok: true, ...result })
    }

    if (payload.type === "UPDATE") {
      const oldStatus = payload.old_record?.status
      const newStatus = record.status
      if (!oldStatus || !newStatus || oldStatus === newStatus) {
        return json({ ok: true, skipped: "status_unchanged" })
      }
      if (oldStatus !== "pending" || (newStatus !== "approved" && newStatus !== "rejected")) {
        return json({ ok: true, skipped: "not_a_review_decision" })
      }
      const result = await emailOwnerReviewResult({
        admin,
        resendKey,
        fromEmail,
        appUrl,
        listing: record,
        decision: newStatus,
      })
      return json({ ok: true, ...result })
    }

    return json({ ok: true, skipped: "unsupported_event" })
  } catch (err) {
    console.error("[notify-listing-review]", err)
    // Never surface a hard failure that encourages endless webhook retries for email issues
    return json({
      ok: true,
      skipped: "unexpected_error",
      error: err instanceof Error ? err.message : "Unexpected error",
    })
  }
})

async function emailAdminsNewListing(opts: {
  admin: SupabaseClient
  resendKey: string
  fromEmail: string
  appUrl: string
  listing: ListingRecord
}) {
  const { data: admins, error: adminError } = await opts.admin
    .from("profiles")
    .select("id, full_name")
    .eq("is_admin", true)

  if (adminError) {
    console.error("[notify-listing-review] admin lookup", adminError.message)
    return { emailed: 0, failed: true }
  }

  if (!admins?.length) {
    console.warn("[notify-listing-review] no admin profiles found")
    return { emailed: 0, skipped: "no_admins" }
  }

  const { data: ownerProfile } = await opts.admin
    .from("profiles")
    .select("full_name")
    .eq("id", opts.listing.owner_id!)
    .maybeSingle()

  const { data: ownerAuth } = await opts.admin.auth.admin.getUserById(opts.listing.owner_id!)
  const ownerName =
    ownerProfile?.full_name?.trim() ||
    (typeof ownerAuth.user?.user_metadata?.full_name === "string"
      ? ownerAuth.user.user_metadata.full_name.trim()
      : "") ||
    ownerAuth.user?.email?.split("@")[0] ||
    "Owner"

  const title = opts.listing.title?.trim() || "Untitled listing"
  const city = opts.listing.city?.trim() || "—"
  const price = formatPrice(opts.listing.price, opts.listing.listing_type)
  const adminUrl = opts.appUrl ? `${opts.appUrl}/admin` : "/admin"

  const html = emailShell({
    heading: "New listing to review",
    body: `
      <p><strong>${escapeHtml(title)}</strong> is waiting for approval.</p>
      <p>${escapeHtml(city)} · ${escapeHtml(price)} · Owner: ${escapeHtml(ownerName)}</p>
      <p><a href="${escapeHtml(adminUrl)}" style="display:inline-block;margin-top:8px;padding:10px 16px;background:#1c1917;color:#f5f0e8;text-decoration:none;border-radius:8px;font-weight:600">Open Admin</a></p>
    `,
  })

  let emailed = 0
  for (const row of admins) {
    const { data: authUser, error: userError } = await opts.admin.auth.admin.getUserById(row.id)
    if (userError || !authUser.user?.email) {
      console.error("[notify-listing-review] admin email missing", row.id, userError?.message)
      continue
    }
    const sent = await sendResend({
      apiKey: opts.resendKey,
      from: opts.fromEmail,
      to: authUser.user.email,
      subject: `Review listing: ${title}`,
      html,
    })
    if (sent) emailed += 1
  }

  return { emailed, kind: "admin_pending" }
}

async function emailOwnerReviewResult(opts: {
  admin: SupabaseClient
  resendKey: string
  fromEmail: string
  appUrl: string
  listing: ListingRecord
  decision: "approved" | "rejected"
}) {
  const { data: ownerAuth, error: ownerError } = await opts.admin.auth.admin.getUserById(
    opts.listing.owner_id!,
  )
  if (ownerError || !ownerAuth.user?.email) {
    console.error("[notify-listing-review] owner email missing", opts.listing.owner_id, ownerError?.message)
    return { emailed: 0, skipped: "no_owner_email" }
  }

  const title = opts.listing.title?.trim() || "Your listing"
  const listingUrl = opts.appUrl
    ? `${opts.appUrl}/listings/${opts.listing.id}`
    : `/listings/${opts.listing.id}`
  const myListingsUrl = opts.appUrl ? `${opts.appUrl}/my-listings` : "/my-listings"

  let html: string
  let subject: string

  if (opts.decision === "approved") {
    subject = `Approved: ${title}`
    html = emailShell({
      heading: "Your listing was approved",
      body: `
        <p><strong>${escapeHtml(title)}</strong> is now live on Haven &amp; Co.</p>
        <p><a href="${escapeHtml(listingUrl)}" style="display:inline-block;margin-top:8px;padding:10px 16px;background:#1c1917;color:#f5f0e8;text-decoration:none;border-radius:8px;font-weight:600">View listing</a></p>
      `,
    })
  } else {
    const reason = opts.listing.rejection_reason?.trim() || "No reason was provided."
    subject = `Update on ${title}`
    html = emailShell({
      heading: "Your listing was not approved",
      body: `
        <p><strong>${escapeHtml(title)}</strong> was rejected.</p>
        <p><strong>Reason:</strong> ${escapeHtml(reason)}</p>
        <p><a href="${escapeHtml(myListingsUrl)}" style="display:inline-block;margin-top:8px;padding:10px 16px;background:#1c1917;color:#f5f0e8;text-decoration:none;border-radius:8px;font-weight:600">My listings</a></p>
      `,
    })
  }

  const sent = await sendResend({
    apiKey: opts.resendKey,
    from: opts.fromEmail,
    to: ownerAuth.user.email,
    subject,
    html,
  })

  return { emailed: sent ? 1 : 0, kind: opts.decision }
}

async function sendResend(opts: {
  apiKey: string
  from: string
  to: string
  subject: string
  html: string
}): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: opts.from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
      }),
    })
    const text = await res.text()
    if (!res.ok) {
      console.error("[notify-listing-review] Resend error", res.status, text)
      return false
    }
    return true
  } catch (err) {
    console.error("[notify-listing-review] Resend request failed", err)
    return false
  }
}

function emailShell(opts: { heading: string; body: string }) {
  return `<!doctype html>
<html><body style="font-family:Georgia,serif;color:#1c1917;line-height:1.5;max-width:520px">
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#a16207">Haven &amp; Co.</p>
  <h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(opts.heading)}</h1>
  ${opts.body}
</body></html>`
}

function formatPrice(price: number | string | undefined, listingType?: string | null): string {
  const n = typeof price === "number" ? price : Number(price)
  if (!Number.isFinite(n)) return "—"
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n)
  return listingType === "rent" ? `${formatted}/mo` : formatted
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
