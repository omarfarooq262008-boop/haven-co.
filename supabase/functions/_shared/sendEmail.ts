/**
 * Shared outbound email for Edge Functions.
 * Prefer Gmail SMTP when GMAIL_USER + GMAIL_APP_PASSWORD are set;
 * otherwise use Resend (RESEND_API_KEY + RESEND_FROM_EMAIL).
 * Secrets only — never expose these to the frontend.
 */

export type EmailAttachment = {
  filename: string
  /** Base64-encoded file content */
  content: string
  contentType?: string
}

export type SendEmailInput = {
  to: string
  subject: string
  html: string
  attachments?: EmailAttachment[]
}

export type SendEmailResult = {
  ok: boolean
  provider?: "gmail" | "resend"
  error?: string
}

export function isEmailConfigured(): boolean {
  return hasGmail() || hasResend()
}

function hasGmail(): boolean {
  return Boolean(Deno.env.get("GMAIL_USER")?.trim() && Deno.env.get("GMAIL_APP_PASSWORD")?.trim())
}

function hasResend(): boolean {
  return Boolean(Deno.env.get("RESEND_API_KEY")?.trim() && Deno.env.get("RESEND_FROM_EMAIL")?.trim())
}

function fromAddress(): string {
  const gmailUser = Deno.env.get("GMAIL_USER")?.trim()
  if (hasGmail() && gmailUser) {
    const named = Deno.env.get("RESEND_FROM_EMAIL")?.trim()
    // Optional display name from RESEND_FROM_EMAIL if it includes this Gmail address
    if (named && named.includes(gmailUser)) return named
    return `Haven & Co <${gmailUser}>`
  }
  return Deno.env.get("RESEND_FROM_EMAIL")?.trim() || ""
}

/** Send one email. Logs failures; callers should not block business writes on result. */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  try {
    if (hasGmail()) {
      return await sendViaGmail(input)
    }
    if (hasResend()) {
      return await sendViaResend(input)
    }
    console.error("[sendEmail] No email provider configured (set Gmail or Resend secrets)")
    return { ok: false, error: "No email provider configured" }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[sendEmail] unexpected error", message)
    return { ok: false, error: message }
  }
}

async function sendViaResend(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY")!.trim()
  const from = fromAddress()
  const body: Record<string, unknown> = {
    from,
    to: [input.to],
    subject: input.subject,
    html: input.html,
  }
  if (input.attachments?.length) {
    body.attachments = input.attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      content_type: a.contentType ?? "application/octet-stream",
    }))
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) {
    console.error("[sendEmail] Resend error", res.status, text)
    return { ok: false, provider: "resend", error: text }
  }
  return { ok: true, provider: "resend" }
}

async function sendViaGmail(input: SendEmailInput): Promise<SendEmailResult> {
  const user = Deno.env.get("GMAIL_USER")!.trim()
  const pass = Deno.env.get("GMAIL_APP_PASSWORD")!.trim().replace(/\s+/g, "")
  const from = fromAddress()
  const mime = buildMimeMessage({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    attachments: input.attachments,
  })

  let conn: Deno.TlsConn | null = null
  try {
    conn = await Deno.connectTls({ hostname: "smtp.gmail.com", port: 465 })
    const reader = conn.readable.getReader()
    const writer = conn.writable.getWriter()
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()
    let buffer = ""

    async function readLine(): Promise<string> {
      while (!buffer.includes("\n")) {
        const { value, done } = await reader.read()
        if (done) throw new Error("SMTP connection closed unexpectedly")
        buffer += decoder.decode(value)
      }
      const idx = buffer.indexOf("\n")
      const line = buffer.slice(0, idx).replace(/\r$/, "")
      buffer = buffer.slice(idx + 1)
      return line
    }

    async function readResponse(): Promise<string> {
      const lines: string[] = []
      while (true) {
        const line = await readLine()
        lines.push(line)
        // Final line of an SMTP reply is "NNN <text>" (space after code)
        if (/^\d{3} /.test(line)) break
      }
      return lines.join("\n")
    }

    async function expect(code: string, command?: string) {
      if (command !== undefined) {
        await writer.write(encoder.encode(`${command}\r\n`))
      }
      const reply = await readResponse()
      if (!reply.startsWith(code)) {
        throw new Error(`SMTP expected ${code}, got: ${reply.trim()}`)
      }
      return reply
    }

    await expect("220")
    await expect("250", "EHLO havenandco")
    await expect("334", "AUTH LOGIN")
    await expect("334", btoa(user))
    await expect("235", btoa(pass))
    await expect("250", `MAIL FROM:<${extractEmail(from)}>`)
    await expect("250", `RCPT TO:<${extractEmail(input.to)}>`)
    await expect("354", "DATA")
    // Dot-stuff lines that begin with "."
    const dotted = mime.replace(/^\./gm, "..")
    await writer.write(encoder.encode(`${dotted}\r\n.\r\n`))
    await expect("250")
    await expect("221", "QUIT")

    return { ok: true, provider: "gmail" }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("[sendEmail] Gmail SMTP error", message)
    return { ok: false, provider: "gmail", error: message }
  } finally {
    try {
      conn?.close()
    } catch {
      /* ignore */
    }
  }
}

function extractEmail(value: string): string {
  const match = value.match(/<([^>]+)>/)
  return (match?.[1] ?? value).trim()
}

function buildMimeMessage(opts: {
  from: string
  to: string
  subject: string
  html: string
  attachments?: EmailAttachment[]
}): string {
  const boundary = `haven_${crypto.randomUUID().replaceAll("-", "")}`
  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${encodeSubject(opts.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ]

  const parts: string[] = []
  parts.push(
    `--${boundary}\r\n` +
      `Content-Type: text/html; charset="utf-8"\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n` +
      `${wrapBase64(utf8ToBase64(opts.html))}\r\n`,
  )

  for (const file of opts.attachments ?? []) {
    const type = file.contentType ?? "application/octet-stream"
    parts.push(
      `--${boundary}\r\n` +
        `Content-Type: ${type}; name="${file.filename}"\r\n` +
        `Content-Transfer-Encoding: base64\r\n` +
        `Content-Disposition: attachment; filename="${file.filename}"\r\n\r\n` +
        `${wrapBase64(file.content)}\r\n`,
    )
  }

  parts.push(`--${boundary}--`)
  return `${headers.join("\r\n")}\r\n\r\n${parts.join("")}`
}

function encodeSubject(subject: string): string {
  // RFC 2047 for non-ASCII subjects
  if (/^[\x20-\x7E]*$/.test(subject)) return subject
  return `=?UTF-8?B?${utf8ToBase64(subject)}?=`
}

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function wrapBase64(value: string, width = 76): string {
  const clean = value.replace(/\s+/g, "")
  const lines: string[] = []
  for (let i = 0; i < clean.length; i += width) {
    lines.push(clean.slice(i, i + width))
  }
  return lines.join("\r\n")
}
