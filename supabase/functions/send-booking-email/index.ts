import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { enforceEdgeRateLimits } from "../_shared/rateLimit.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type BookingRow = {
  id: string
  listing_id: string
  owner_id: string
  visitor_id: string | null
  visitor_name: string
  visitor_email: string
  visitor_phone: string
  meeting_at: string
  note: string
  status: string
}

type ListingRow = {
  id: string
  title: string
  address: string | null
  city: string
  owner_id: string
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY")
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL")
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")

    if (!resendKey || !fromEmail || !supabaseUrl || !serviceRoleKey || !anonKey) {
      console.error("[send-booking-email] Missing secrets")
      return json({ error: "Email service is not configured" }, 500)
    }

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401)
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return json({ error: "Unauthorized" }, 401)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const limited = await enforceEdgeRateLimits({
      admin,
      req,
      scope: "send-booking-email",
      userId: user.id,
      ipMax: 30,
      ipWindowSeconds: 3600,
      userMax: 10,
      userWindowSeconds: 3600,
    })
    if (!limited.ok) {
      return json({ error: limited.message }, limited.status)
    }

    const body = (await req.json().catch(() => ({}))) as { bookingId?: string }
    if (!body.bookingId) {
      return json({ error: "bookingId is required" }, 400)
    }
    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .select("*")
      .eq("id", body.bookingId)
      .single()

    if (bookingError || !booking) {
      console.error("[send-booking-email] booking lookup", bookingError?.message)
      return json({ error: "Booking not found" }, 404)
    }

    const row = booking as BookingRow
    if (user.id !== row.visitor_id && user.id !== row.owner_id) {
      return json({ error: "Forbidden" }, 403)
    }

    const { data: listing, error: listingError } = await admin
      .from("listings")
      .select("id, title, address, city, owner_id")
      .eq("id", row.listing_id)
      .single()

    if (listingError || !listing) {
      console.error("[send-booking-email] listing lookup", listingError?.message)
      return json({ error: "Listing not found" }, 404)
    }

    const listingRow = listing as ListingRow
    const location = [listingRow.address, listingRow.city].filter(Boolean).join(", ")
    const meetingDate = new Date(row.meeting_at)
    const meetingLabel = meetingDate.toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    })

    const { data: ownerData, error: ownerError } = await admin.auth.admin.getUserById(row.owner_id)
    if (ownerError || !ownerData.user?.email) {
      console.error("[send-booking-email] owner email", ownerError?.message)
      return json({ error: "Owner email not found" }, 500)
    }
    const ownerEmail = ownerData.user.email

    const ics = buildIcs({
      bookingId: row.id,
      title: listingRow.title,
      location,
      meetingAt: meetingDate,
      description: `Viewing with ${row.visitor_name} (${row.visitor_email}, ${row.visitor_phone})${
        row.note ? `\nNote: ${row.note}` : ""
      }`,
    })
    const icsBase64 = utf8ToBase64(ics)

    const visitorHtml = emailHtml({
      heading: "Your viewing is confirmed",
      intro: `Hi ${escapeHtml(row.visitor_name)}, your meeting for <strong>${escapeHtml(listingRow.title)}</strong> is booked.`,
      meetingLabel,
      location,
      note: row.note,
      footer: "Add the attached calendar invite so you don’t miss it.",
    })

    const ownerHtml = emailHtml({
      heading: "New viewing booked",
      intro: `<strong>${escapeHtml(row.visitor_name)}</strong> booked a viewing for <strong>${escapeHtml(listingRow.title)}</strong>.`,
      meetingLabel,
      location,
      note: row.note,
      extra: `Visitor: ${escapeHtml(row.visitor_name)} · ${escapeHtml(row.visitor_email)} · ${escapeHtml(row.visitor_phone)}`,
      footer: "A calendar invite is attached.",
    })

    const visitorResult = await sendResend({
      apiKey: resendKey,
      from: fromEmail,
      to: row.visitor_email,
      subject: `Viewing confirmed: ${listingRow.title}`,
      html: visitorHtml,
      icsBase64,
    })

    const ownerResult = await sendResend({
      apiKey: resendKey,
      from: fromEmail,
      to: ownerEmail,
      subject: `New viewing: ${listingRow.title}`,
      html: ownerHtml,
      icsBase64,
    })

    if (!visitorResult.ok || !ownerResult.ok) {
      console.error("[send-booking-email] Resend errors", {
        visitor: visitorResult,
        owner: ownerResult,
      })
      return json(
        {
          ok: false,
          visitor: visitorResult,
          owner: ownerResult,
        },
        502,
      )
    }

    return json({ ok: true })
  } catch (err) {
    console.error("[send-booking-email]", err)
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500)
  }
})

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function emailHtml(opts: {
  heading: string
  intro: string
  meetingLabel: string
  location: string
  note?: string
  extra?: string
  footer: string
}) {
  return `<!doctype html>
<html><body style="font-family:Georgia,serif;color:#1c1917;line-height:1.5">
  <h1 style="font-size:22px">${escapeHtml(opts.heading)}</h1>
  <p>${opts.intro}</p>
  <p><strong>When:</strong> ${escapeHtml(opts.meetingLabel)}</p>
  <p><strong>Where:</strong> ${escapeHtml(opts.location || "See listing")}</p>
  ${opts.extra ? `<p>${opts.extra}</p>` : ""}
  ${opts.note ? `<p><strong>Note:</strong> ${escapeHtml(opts.note)}</p>` : ""}
  <p style="color:#78716c">${escapeHtml(opts.footer)}</p>
  <p style="color:#a8a29e;font-size:12px">Haven &amp; Co.</p>
</body></html>`
}

function toIcsUtc(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  )
}

function foldIcs(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = []
  let rest = line
  parts.push(rest.slice(0, 75))
  rest = rest.slice(75)
  while (rest.length) {
    parts.push(` ${rest.slice(0, 74)}`)
    rest = rest.slice(74)
  }
  return parts.join("\r\n")
}

function buildIcs(opts: {
  bookingId: string
  title: string
  location: string
  meetingAt: Date
  description: string
}): string {
  const end = new Date(opts.meetingAt.getTime() + 60 * 60 * 1000)
  const stamp = toIcsUtc(new Date())
  const start = toIcsUtc(opts.meetingAt)
  const endUtc = toIcsUtc(end)
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Haven & Co//Bookings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:booking-${opts.bookingId}@havenandco`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${endUtc}`,
    foldIcs(`SUMMARY:Viewing: ${opts.title.replace(/\r?\n/g, " ")}`),
    foldIcs(`LOCATION:${opts.location.replace(/\r?\n/g, " ")}`),
    foldIcs(`DESCRIPTION:${opts.description.replace(/\r?\n/g, "\\n")}`),
    "END:VEVENT",
    "END:VCALENDAR",
  ]
  return lines.join("\r\n") + "\r\n"
}

async function sendResend(opts: {
  apiKey: string
  from: string
  to: string
  subject: string
  html: string
  icsBase64: string
}) {
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
      attachments: [
        {
          filename: "viewing.ics",
          content: opts.icsBase64,
          content_type: "text/calendar; charset=utf-8; method=REQUEST",
        },
      ],
    }),
  })

  const text = await res.text()
  let parsed: unknown = text
  try {
    parsed = JSON.parse(text)
  } catch {
    /* keep text */
  }

  if (!res.ok) {
    return { ok: false as const, status: res.status, body: parsed }
  }
  return { ok: true as const, status: res.status, body: parsed }
}
