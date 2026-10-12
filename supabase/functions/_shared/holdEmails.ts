/**
 * Confirmation emails after a hold payment succeeds.
 * Soft-fails: logs errors, never throws to callers.
 */
import { sendEmail } from "./sendEmail.ts"

type BookingEmailRow = {
  id: string
  visitor_name: string
  visitor_email: string
  visitor_phone: string
  meeting_at: string
  note: string
  owner_id: string
}

type ListingEmailRow = {
  title: string
  address: string | null
  city: string
}

export async function sendHoldConfirmationEmails(opts: {
  booking: BookingEmailRow
  listing: ListingEmailRow
  ownerEmail: string
  amount: number
  currency: string
  expiresAt: string
}): Promise<void> {
  try {
    const location = [opts.listing.address, opts.listing.city].filter(Boolean).join(", ")
    const meetingDate = new Date(opts.booking.meeting_at)
    const meetingLabel = meetingDate.toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    })
    const expiresLabel = new Date(opts.expiresAt).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    })
    const fee = `${opts.amount} ${opts.currency}`

    const ics = buildIcs({
      bookingId: opts.booking.id,
      title: opts.listing.title,
      location,
      meetingAt: meetingDate,
      description: `Held viewing with ${opts.booking.visitor_name} (${opts.booking.visitor_email}, ${opts.booking.visitor_phone})${
        opts.booking.note ? `\nNote: ${opts.booking.note}` : ""
      }`,
    })
    const attachments = [
      {
        filename: "viewing.ics",
        content: utf8ToBase64(ics),
        contentType: "text/calendar; charset=utf-8; method=REQUEST",
      },
    ]

    const visitorHtml = shell({
      heading: "Your hold is confirmed",
      body: `
        <p>Hi ${escapeHtml(opts.booking.visitor_name)}, your hold on
          <strong>${escapeHtml(opts.listing.title)}</strong> is active.</p>
        <p><strong>Hold fee:</strong> ${escapeHtml(fee)} (fully refundable if the owner cancels or declines)</p>
        <p><strong>Hold ends:</strong> ${escapeHtml(expiresLabel)} (48 hours or your meeting time, whichever comes first)</p>
        <p><strong>Meeting:</strong> ${escapeHtml(meetingLabel)}</p>
        <p><strong>Where:</strong> ${escapeHtml(location || "See listing")}</p>
        ${opts.booking.note ? `<p><strong>Note:</strong> ${escapeHtml(opts.booking.note)}</p>` : ""}
        <p style="color:#78716c">A calendar invite is attached. The fee is not refundable if you do not show up.</p>
      `,
    })

    const ownerHtml = shell({
      heading: "Property held for a viewing",
      body: `
        <p><strong>${escapeHtml(opts.booking.visitor_name)}</strong> paid a hold fee for
          <strong>${escapeHtml(opts.listing.title)}</strong>.</p>
        <p><strong>Hold fee:</strong> ${escapeHtml(fee)}</p>
        <p><strong>Hold ends:</strong> ${escapeHtml(expiresLabel)}</p>
        <p><strong>Meeting:</strong> ${escapeHtml(meetingLabel)}</p>
        <p>Visitor: ${escapeHtml(opts.booking.visitor_name)} ·
          ${escapeHtml(opts.booking.visitor_email)} ·
          ${escapeHtml(opts.booking.visitor_phone)}</p>
        <p style="color:#78716c">If you cancel or decline, the visitor is refunded automatically.</p>
      `,
    })

    const visitorResult = await sendEmail({
      to: opts.booking.visitor_email,
      subject: `Hold confirmed: ${opts.listing.title}`,
      html: visitorHtml,
      attachments,
    })
    const ownerResult = await sendEmail({
      to: opts.ownerEmail,
      subject: `Hold placed: ${opts.listing.title}`,
      html: ownerHtml,
      attachments,
    })

    if (!visitorResult.ok || !ownerResult.ok) {
      console.error("[holdEmails] send errors", { visitorResult, ownerResult })
    }
  } catch (err) {
    console.error("[holdEmails] unexpected", err)
  }
}

function shell(opts: { heading: string; body: string }) {
  return `<!doctype html>
<html><body style="font-family:Georgia,serif;color:#1c1917;line-height:1.5;max-width:520px">
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#a16207">Haven &amp; Co.</p>
  <h1 style="font-size:22px;margin:0 0 12px">${escapeHtml(opts.heading)}</h1>
  ${opts.body}
</body></html>`
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
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
    "PRODID:-//Haven & Co//Holds//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:hold-${opts.bookingId}@havenandco`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${endUtc}`,
    foldIcs(`SUMMARY:Held viewing: ${opts.title.replace(/\r?\n/g, " ")}`),
    foldIcs(`LOCATION:${opts.location.replace(/\r?\n/g, " ")}`),
    foldIcs(`DESCRIPTION:${opts.description.replace(/\r?\n/g, "\\n")}`),
    "END:VEVENT",
    "END:VCALENDAR",
  ]
  return lines.join("\r\n") + "\r\n"
}
