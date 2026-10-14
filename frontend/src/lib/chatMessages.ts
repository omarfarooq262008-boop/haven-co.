import type { Message } from './types'

export type MessageSendStatus = 'sending' | 'sent' | 'failed'

export type ReplyPreview = {
  id: string
  body: string
  sender_id: string
  conversation_id?: string
}

/** Client-enriched message row used by the Messages UI. */
export type ChatMessage = Message & {
  reply_to_id?: string | null
  reply_to?: ReplyPreview | null
  /** Temporary id for optimistic rows (`temp-…`). */
  client_id?: string
  status?: MessageSendStatus
}

export type ConversationActivity = {
  last_preview: string
  last_activity_at: string
  unread: boolean
}

const TEMP_PREFIX = 'temp-'

export function isTempMessageId(id: string): boolean {
  return id.startsWith(TEMP_PREFIX)
}

export function createTempMessageId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${TEMP_PREFIX}${crypto.randomUUID()}`
  }
  return `${TEMP_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function previewMessageBody(body: string, max = 80): string {
  const oneLine = body.replace(/\s+/g, ' ').trim()
  if (oneLine.length <= max) return oneLine
  return `${oneLine.slice(0, max - 1)}…`
}

export function replyListPreview(opts: {
  body: string
  isReply: boolean
  replyBody?: string | null
}): string {
  if (!opts.isReply) return previewMessageBody(opts.body)
  const quoted = opts.replyBody ? previewMessageBody(opts.replyBody, 40) : 'message'
  return `↩ ${quoted}: ${previewMessageBody(opts.body, 48)}`
}

/** Merge a realtime / saved row into the list without duplicating optimistic sends. */
export function mergeIncomingMessage(prev: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  if (prev.some((m) => m.id === incoming.id)) {
    return prev.map((m) => (m.id === incoming.id ? { ...m, ...incoming, status: 'sent' as const } : m))
  }

  const optimisticIdx = prev.findIndex(
    (m) =>
      m.status === 'sending' &&
      isTempMessageId(m.id) &&
      m.sender_id === incoming.sender_id &&
      m.conversation_id === incoming.conversation_id &&
      m.body === incoming.body &&
      (m.reply_to_id ?? null) === (incoming.reply_to_id ?? null),
  )

  if (optimisticIdx >= 0) {
    const next = prev.slice()
    const prior = next[optimisticIdx]
    next[optimisticIdx] = {
      ...incoming,
      client_id: prior.client_id,
      status: 'sent',
      reply_to: incoming.reply_to ?? prior.reply_to ?? null,
    }
    return next
  }

  return [...prev, { ...incoming, status: incoming.status ?? 'sent' }]
}

export function replaceOptimisticWithSaved(
  prev: ChatMessage[],
  tempId: string,
  saved: ChatMessage,
): ChatMessage[] {
  return prev.map((m) =>
    m.id === tempId
      ? { ...saved, client_id: m.client_id ?? tempId, status: 'sent' as const }
      : m,
  )
}

export function markOptimisticFailed(prev: ChatMessage[], tempId: string): ChatMessage[] {
  return prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' as const } : m))
}

export function buildOptimisticMessage(opts: {
  tempId: string
  conversationId: string
  senderId: string
  body: string
  replyTo?: ReplyPreview | null
}): ChatMessage {
  return {
    id: opts.tempId,
    client_id: opts.tempId,
    conversation_id: opts.conversationId,
    sender_id: opts.senderId,
    body: opts.body,
    created_at: new Date().toISOString(),
    reply_to_id: opts.replyTo?.id ?? null,
    reply_to: opts.replyTo ?? null,
    status: 'sending',
  }
}

export function isNearBottom(el: HTMLElement, thresholdPx = 96): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx
}

export function sortConversationsByActivity<
  T extends { id: string; created_at: string; last_activity_at?: string },
>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => {
    const aAt = a.last_activity_at ?? a.created_at
    const bAt = b.last_activity_at ?? b.created_at
    return new Date(bAt).getTime() - new Date(aAt).getTime()
  })
}

/** Normalize a PostgREST message row that may include nested reply_to. */
export function normalizeMessageRow(row: Record<string, unknown>): ChatMessage {
  const replyRaw = row.reply_to
  let reply_to: ReplyPreview | null = null
  if (replyRaw && typeof replyRaw === 'object' && !Array.isArray(replyRaw)) {
    const r = replyRaw as Record<string, unknown>
    if (typeof r.id === 'string' && typeof r.body === 'string' && typeof r.sender_id === 'string') {
      reply_to = {
        id: r.id,
        body: r.body,
        sender_id: r.sender_id,
        conversation_id: typeof r.conversation_id === 'string' ? r.conversation_id : undefined,
      }
    }
  }

  return {
    id: String(row.id),
    conversation_id: String(row.conversation_id),
    sender_id: String(row.sender_id),
    body: String(row.body ?? ''),
    created_at: String(row.created_at),
    reply_to_id: (row.reply_to_id as string | null | undefined) ?? null,
    reply_to,
    status: 'sent',
  }
}

export const MESSAGE_SELECT =
  'id, conversation_id, sender_id, body, created_at, reply_to_id, reply_to:messages!reply_to_id(id, body, sender_id, conversation_id)'
