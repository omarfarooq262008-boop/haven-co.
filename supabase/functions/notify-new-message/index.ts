import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { enforceEdgeRateLimits } from "../_shared/rateLimit.ts"

type WebhookPayload = {
  type?: string
  table?: string
  schema?: string
  record?: {
    id?: string
    conversation_id?: string
    sender_id?: string
    body?: string
    created_at?: string
  } | null
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
    const webhookSecret = Deno.env.get("MESSAGE_NOTIFY_WEBHOOK_SECRET")
    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "")

    if (!resendKey || !fromEmail || !supabaseUrl || !serviceRoleKey) {
      console.error("[notify-new-message] Missing Resend or Supabase secrets")
      return json({ error: "Email service is not configured" }, 500)
    }

    if (!webhookSecret) {
      console.error("[notify-new-message] MESSAGE_NOTIFY_WEBHOOK_SECRET is not set")
      return json({ error: "Webhook secret is not configured" }, 500)
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
    if (!payload || payload.type !== "INSERT" || payload.table !== "messages") {
      return json({ ok: true, skipped: "not a messages insert" })
    }

    const record = payload.record
    if (!record?.id || !record.conversation_id || !record.sender_id || !record.body) {
      return json({ error: "Invalid message payload" }, 400)
    }

    const limited = await enforceEdgeRateLimits({
      admin,
      req,
      scope: "notify-new-message",
      userId: record.sender_id,
      // Webhooks share infra IPs — keep the IP ceiling high; user/sender is the real throttle.
      ipMax: 120,
      ipWindowSeconds: 60,
      userMax: 20,
      userWindowSeconds: 3600,
    })
    if (!limited.ok) {
      return json({ error: limited.message, skipped: "rate_limit" }, limited.status)
    }

    const { data: conversation, error: convError } = await admin
      .from("conversations")
      .select("id, listing_id, buyer_id, owner_id")
      .eq("id", record.conversation_id)
      .single()

    if (convError || !conversation) {
      console.error("[notify-new-message] conversation", convError?.message)
      return json({ error: "Conversation not found" }, 404)
    }

    const recipientId =
      record.sender_id === conversation.buyer_id
        ? conversation.owner_id
        : record.sender_id === conversation.owner_id
          ? conversation.buyer_id
          : null

    if (!recipientId) {
      console.error("[notify-new-message] sender is not a participant")
      return json({ ok: true, skipped: "sender not in conversation" })
    }

    const { data: claimed, error: claimError } = await admin.rpc(
      "try_claim_message_email_cooldown",
      { p_conversation_id: conversation.id },
    )

    if (claimError) {
      console.error("[notify-new-message] cooldown claim", claimError.message)
      return json({ error: "Cooldown check failed" }, 500)
    }

    if (!claimed) {
      return json({ ok: true, skipped: "cooldown" })
    }

    const [{ data: listing }, { data: senderProfile }, recipientResult, senderAuthResult] =
      await Promise.all([
        admin.from("listings").select("id, title").eq("id", conversation.listing_id).maybeSingle(),
        admin.from("profiles").select("full_name").eq("id", record.sender_id).maybeSingle(),
        admin.auth.admin.getUserById(recipientId),
        admin.auth.admin.getUserById(record.sender_id),
      ])

    const recipientEmail = recipientResult.data.user?.email
    if (!recipientEmail) {
      console.error("[notify-new-message] recipient has no email", recipientId)
      return json({ ok: true, skipped: "no recipient email" })
    }

    const metaName = senderAuthResult.data.user?.user_metadata?.full_name
    const displayName =
      senderProfile?.full_name?.trim() ||
      (typeof metaName === "string" ? metaName.trim() : "") ||
      senderAuthResult.data.user?.email?.split("@")[0] ||
      "Someone"

    const listingTitle = listing?.title?.trim() || "a listing"
    const preview = truncate(record.body.trim(), 140)
    const messagesUrl = appUrl
      ? `${appUrl}/messages/${conversation.id}`
      : `https://example.com/messages/${conversation.id}`

    if (!appUrl) {
      console.warn("[notify-new-message] APP_URL is not set; email link will be a placeholder")
    }

    const html = `<!doctype html>
<html><body style="font-family:Georgia,serif;color:#1c1917;line-height:1.5">
  <h1 style="font-size:22px">New message on Haven &amp; Co.</h1>
  <p><strong>${escapeHtml(displayName)}</strong> messaged you about
    <strong>${escapeHtml(listingTitle)}</strong>.</p>
  <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #c9a227;background:#faf7f2">
    ${escapeHtml(preview)}
  </blockquote>
  <p><a href="${escapeHtml(messagesUrl)}" style="color:#1c1917;font-weight:600">Open Messages</a></p>
  <p style="color:#a8a29e;font-size:12px">You won’t get another email for this chat for 15 minutes.</p>
</body></html>`

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipientEmail],
        subject: `New message about ${listingTitle}`,
        html,
      }),
    })

    const text = await res.text()
    if (!res.ok) {
      console.error("[notify-new-message] Resend error", res.status, text)
      // Let the next message retry sooner after a send failure
      await admin.from("message_email_cooldowns").delete().eq("conversation_id", conversation.id)
      return json({ error: "Failed to send email", detail: text }, 502)
    }

    return json({ ok: true, emailed: recipientEmail })
  } catch (err) {
    console.error("[notify-new-message]", err)
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500)
  }
})

function truncate(text: string, max: number) {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
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
