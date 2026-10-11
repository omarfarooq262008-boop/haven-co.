/** Map Postgres / Auth / Edge rate-limit errors to clear UI copy. */
export function friendlyError(message: string | null | undefined, fallback: string): string {
  if (!message?.trim()) return fallback

  const raw = message.trim()
  const lower = raw.toLowerCase()

  if (
    lower.includes('please wait a moment before sending another message') ||
    (lower.includes('rate') && lower.includes('message'))
  ) {
    return 'Please wait a moment before sending another message.'
  }

  if (
    lower.includes('10 new listings') ||
    (lower.includes('listings per day') && lower.includes('limit'))
  ) {
    return "You've reached the limit of 10 new listings per day. Please try again tomorrow."
  }

  if (
    lower.includes('booked too many meetings') ||
    (lower.includes('booking') && lower.includes('limit'))
  ) {
    return "You've booked too many meetings recently. Please try again in a bit."
  }

  if (
    lower.includes('too many requests') ||
    lower.includes('doing that too often') ||
    lower.includes('over_request_rate_limit') ||
    lower.includes('429')
  ) {
    return "You're doing that too often. Please wait a moment and try again."
  }

  if (
    lower.includes('over_email_send_rate_limit') ||
    lower.includes('email rate limit') ||
    lower.includes('for security purposes, you can only request this after')
  ) {
    return 'Too many login attempts. Please wait a minute and try again.'
  }

  // PostgREST often prefixes: `P0001: <message>` or `error: <message>`
  const stripped = raw.replace(/^(P0001:\s*|ERROR:\s*|error:\s*)/i, '').trim()
  if (
    stripped.startsWith("You've reached the limit") ||
    stripped.startsWith('Please wait a moment') ||
    stripped.startsWith("You've booked too many")
  ) {
    return stripped
  }

  return stripped.length > 0 && stripped.length < 220 ? stripped : fallback
}
