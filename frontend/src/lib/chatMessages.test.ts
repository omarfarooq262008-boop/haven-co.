import { describe, expect, it } from 'vitest'
import {
  buildOptimisticMessage,
  createTempMessageId,
  isTempMessageId,
  markOptimisticFailed,
  mergeIncomingMessage,
  previewMessageBody,
  replaceOptimisticWithSaved,
  replyListPreview,
  sortConversationsByActivity,
  type ChatMessage,
} from './chatMessages'

function base(partial: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'body'>): ChatMessage {
  return {
    conversation_id: 'c1',
    sender_id: 'u1',
    created_at: '2026-01-01T00:00:00.000Z',
    status: 'sent',
    ...partial,
  }
}

describe('optimistic send + duplicate handling', () => {
  it('creates temp ids', () => {
    const id = createTempMessageId()
    expect(isTempMessageId(id)).toBe(true)
  })

  it('replaces optimistic row when realtime arrives for the same send', () => {
    const temp = buildOptimisticMessage({
      tempId: 'temp-abc',
      conversationId: 'c1',
      senderId: 'u1',
      body: 'Hello there',
    })
    const saved = base({
      id: 'real-1',
      body: 'Hello there',
      sender_id: 'u1',
      conversation_id: 'c1',
    })
    const merged = mergeIncomingMessage([temp], saved)
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('real-1')
    expect(merged[0].status).toBe('sent')
    expect(merged[0].client_id).toBe('temp-abc')
  })

  it('does not duplicate when the same saved id arrives twice', () => {
    const saved = base({ id: 'real-1', body: 'Hi' })
    const once = mergeIncomingMessage([], saved)
    const twice = mergeIncomingMessage(once, saved)
    expect(twice).toHaveLength(1)
  })

  it('appends a different peer message', () => {
    const mine = base({ id: 'm1', body: 'A', sender_id: 'u1' })
    const theirs = base({ id: 'm2', body: 'B', sender_id: 'u2' })
    expect(mergeIncomingMessage([mine], theirs)).toHaveLength(2)
  })

  it('replaceOptimisticWithSaved and markOptimisticFailed', () => {
    const temp = buildOptimisticMessage({
      tempId: 'temp-1',
      conversationId: 'c1',
      senderId: 'u1',
      body: 'Ping',
    })
    const saved = base({ id: 'db-1', body: 'Ping' })
    expect(replaceOptimisticWithSaved([temp], 'temp-1', saved)[0].id).toBe('db-1')
    expect(markOptimisticFailed([temp], 'temp-1')[0].status).toBe('failed')
  })

  it('matches replies on optimistic merge', () => {
    const temp = buildOptimisticMessage({
      tempId: 'temp-r',
      conversationId: 'c1',
      senderId: 'u1',
      body: 'Sure',
      replyTo: { id: 'orig', body: 'Can we meet?', sender_id: 'u2' },
    })
    const saved = base({
      id: 'real-r',
      body: 'Sure',
      reply_to_id: 'orig',
      reply_to: { id: 'orig', body: 'Can we meet?', sender_id: 'u2' },
    })
    const merged = mergeIncomingMessage([temp], saved)
    expect(merged).toHaveLength(1)
    expect(merged[0].reply_to_id).toBe('orig')
  })
})

describe('reply preview helpers', () => {
  it('truncates body previews', () => {
    expect(previewMessageBody('short')).toBe('short')
    expect(previewMessageBody('x'.repeat(100)).endsWith('…')).toBe(true)
  })

  it('formats reply list preview', () => {
    expect(replyListPreview({ body: 'Ok', isReply: false })).toBe('Ok')
    expect(replyListPreview({ body: 'Ok', isReply: true, replyBody: 'Hello' })).toContain('↩')
    expect(replyListPreview({ body: 'Ok', isReply: true, replyBody: 'Hello' })).toContain('Hello')
  })

  it('sorts conversations by latest activity', () => {
    const rows = [
      { id: 'a', created_at: '2026-01-01T00:00:00Z', last_activity_at: '2026-01-01T00:00:00Z' },
      { id: 'b', created_at: '2026-01-01T00:00:00Z', last_activity_at: '2026-01-02T00:00:00Z' },
    ]
    expect(sortConversationsByActivity(rows).map((r) => r.id)).toEqual(['b', 'a'])
  })
})
