import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ListingImage } from '../components/ListingImage'
import { useAuth } from '../context/AuthContext'
import {
  buildOptimisticMessage,
  createTempMessageId,
  isNearBottom,
  isTempMessageId,
  markOptimisticFailed,
  mergeIncomingMessage,
  MESSAGE_SELECT,
  normalizeMessageRow,
  previewMessageBody,
  replaceOptimisticWithSaved,
  replyListPreview,
  sortConversationsByActivity,
  type ChatMessage,
  type ReplyPreview,
} from '../lib/chatMessages'
import { friendlyError } from '../lib/errors'
import { LIMITS, validateMessageBody } from '../lib/listingForm'
import { formatConversationTime, formatMessageTime } from '../lib/messaging'
import { bubbleVariants } from '../lib/motion'
import { hasMoreRows, PAGE_SIZE, rangeForPage } from '../lib/pagination'
import { supabase } from '../lib/supabase'
import type { Conversation, Profile } from '../lib/types'

type ConnState = 'live' | 'reconnecting' | 'offline'

export function MessagesPage() {
  const { conversationId } = useParams()
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const reduced = useReducedMotion()

  const listRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const stickToBottomRef = useRef(true)
  const lastSeenAtRef = useRef<string | null>(null)
  const highlightTimerRef = useRef<number | null>(null)

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<ReplyPreview | null>(null)
  const [menuForId, setMenuForId] = useState<string | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [showJumpNew, setShowJumpNew] = useState(false)
  const [conn, setConn] = useState<ConnState>('live')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingChat, setLoadingChat] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [loadingMoreConvos, setLoadingMoreConvos] = useState(false)
  const [convoPage, setConvoPage] = useState(0)
  const [hasMoreConvos, setHasMoreConvos] = useState(false)
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [ensureDone, setEnsureDone] = useState(false)
  const [liveRegion, setLiveRegion] = useState('')

  const active = useMemo(
    () => conversations.find((c) => c.id === conversationId) ?? null,
    [conversations, conversationId],
  )
  const conversationMissing = Boolean(conversationId) && !loadingList && ensureDone && !active
  const nameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of conversations) {
      if (c.other_name && user) {
        const otherId = c.buyer_id === user.id ? c.owner_id : c.buyer_id
        map.set(otherId, c.other_name)
      }
    }
    return map
  }, [conversations, user])

  const enrichConversations = useCallback(async (rows: Conversation[], uid: string) => {
    const otherIds = [...new Set(rows.map((c) => (c.buyer_id === uid ? c.owner_id : c.buyer_id)))]
    const names = new Map<string, string>()
    if (otherIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles_safe')
        .select('id, full_name')
        .in('id', otherIds)
      for (const p of (profiles ?? []) as Profile[]) {
        names.set(p.id, p.full_name?.trim() || 'User')
      }
    }
    return rows.map((c) => {
      const otherId = c.buyer_id === uid ? c.owner_id : c.buyer_id
      return { ...c, other_name: names.get(otherId) ?? c.other_name ?? 'User' }
    })
  }, [])

  const fetchMessagesPage = useCallback(
    async (opts: { conversationId: string; before?: string; rangeTo: number }) => {
      const base = () => {
        let q = supabase
          .from('messages')
          .select(MESSAGE_SELECT)
          .eq('conversation_id', opts.conversationId)
          .order('created_at', { ascending: false })
          .range(0, opts.rangeTo)
        if (opts.before) q = q.lt('created_at', opts.before)
        return q
      }
      const primary = await base()
      let rowsRaw: Record<string, unknown>[] | null = (primary.data as Record<string, unknown>[] | null) ?? null
      let errMsg = primary.error?.message ?? null
      if (primary.error) {
        // Fallback before reply migration is applied
        let q = supabase
          .from('messages')
          .select('id, conversation_id, sender_id, body, created_at, reply_to_id')
          .eq('conversation_id', opts.conversationId)
          .order('created_at', { ascending: false })
          .range(0, opts.rangeTo)
        if (opts.before) q = q.lt('created_at', opts.before)
        const fallback = await q
        rowsRaw = (fallback.data as Record<string, unknown>[] | null) ?? null
        errMsg = fallback.error?.message ?? null
      }
      if (errMsg) return { rows: [] as ChatMessage[], error: errMsg, rawCount: 0 }
      const rows = (rowsRaw ?? []).map(normalizeMessageRow)
      return { rows: rows.slice().reverse(), error: null as string | null, rawCount: rows.length }
    },
    [],
  )

  const applyInboxMessage = useCallback(
    (incoming: ChatMessage, uid: string, openId: string | undefined) => {
      const preview = replyListPreview({
        body: incoming.body,
        isReply: Boolean(incoming.reply_to_id),
        replyBody: incoming.reply_to?.body,
      })
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === incoming.conversation_id)
        if (idx < 0) return prev
        const next = prev.slice()
        const row = next[idx]
        next[idx] = {
          ...row,
          last_preview: preview,
          last_activity_at: incoming.created_at,
          unread: incoming.conversation_id !== openId && incoming.sender_id !== uid ? true : row.unread,
        }
        return sortConversationsByActivity(next)
      })
      if (incoming.conversation_id === openId && incoming.sender_id !== uid) {
        setLiveRegion(`New message from ${nameById.get(incoming.sender_id) ?? 'contact'}`)
      }
    },
    [nameById],
  )

  const scrollToBottom = useCallback((smooth = true) => {
    const el = listRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduced ? 'smooth' : 'auto' })
    setShowJumpNew(false)
    stickToBottomRef.current = true
  }, [reduced])

  const scrollToMessage = useCallback((id: string) => {
    const node = document.getElementById(`msg-${id}`)
    if (!node) return
    node.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })
    setHighlightId(id)
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
    highlightTimerRef.current = window.setTimeout(() => setHighlightId(null), 1200)
  }, [reduced])

  // Load conversation list + latest previews
  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      setLoadingList(true)
      setError(null)
      setConvoPage(0)
      const { from, to } = rangeForPage(0, PAGE_SIZE.conversations)
      const { data, error: qError } = await supabase
        .from('conversations')
        .select('*, listings(id, title, city, image_urls)')
        .or(`buyer_id.eq.${user.id},owner_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .range(from, to)
      if (cancelled) return
      if (qError) {
        setError(qError.message)
        setConversations([])
        setLoadingList(false)
        return
      }
      let rows = await enrichConversations((data ?? []) as Conversation[], user.id)
      const ids = rows.map((r) => r.id)
      if (ids.length > 0) {
        const { data: recent } = await supabase
          .from('messages')
          .select('id, conversation_id, sender_id, body, created_at, reply_to_id')
          .in('conversation_id', ids)
          .order('created_at', { ascending: false })
          .limit(ids.length * 3)
        const latest = new Map<string, { body: string; at: string; reply: boolean }>()
        for (const m of recent ?? []) {
          const row = m as { conversation_id: string; body: string; created_at: string; reply_to_id: string | null }
          if (!latest.has(row.conversation_id)) {
            latest.set(row.conversation_id, {
              body: row.body,
              at: row.created_at,
              reply: Boolean(row.reply_to_id),
            })
          }
        }
        rows = rows.map((c) => {
          const hit = latest.get(c.id)
          if (!hit) return c
          return {
            ...c,
            last_preview: replyListPreview({ body: hit.body, isReply: hit.reply }),
            last_activity_at: hit.at,
          }
        })
        rows = sortConversationsByActivity(rows)
      }
      if (cancelled) return
      setConversations(rows)
      setHasMoreConvos(hasMoreRows((data ?? []).length, PAGE_SIZE.conversations))
      setLoadingList(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user, enrichConversations])

  // Deep-link ensure
  useEffect(() => {
    if (!conversationId) {
      setEnsureDone(true)
      return
    }
    if (!user || loadingList) {
      setEnsureDone(false)
      return
    }
    let cancelled = false
    setEnsureDone(false)
    ;(async () => {
      const { data: one } = await supabase
        .from('conversations')
        .select('*, listings(id, title, city, image_urls)')
        .eq('id', conversationId)
        .or(`buyer_id.eq.${user.id},owner_id.eq.${user.id}`)
        .maybeSingle()
      if (cancelled) return
      if (one) {
        const enriched = await enrichConversations([one as Conversation], user.id)
        if (cancelled) return
        setConversations((prev) =>
          prev.some((c) => c.id === conversationId) ? prev : [...enriched, ...prev],
        )
      }
      setEnsureDone(true)
    })()
    return () => {
      cancelled = true
    }
  }, [user, conversationId, loadingList, enrichConversations])

  // Mark active conversation read
  useEffect(() => {
    if (!conversationId) return
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, unread: false } : c)),
    )
  }, [conversationId])

  // Inbox-wide realtime (sidebar) + connection banner
  useEffect(() => {
    if (!user) return
    let cancelled = false
    const channel = supabase
      .channel(`messages:inbox:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const incoming = normalizeMessageRow(payload.new as Record<string, unknown>)
          applyInboxMessage(incoming, user.id, conversationId)
          if (incoming.conversation_id === conversationId) {
            setMessages((prev) => mergeIncomingMessage(prev, incoming))
            const el = listRef.current
            if (el && isNearBottom(el)) {
              stickToBottomRef.current = true
              requestAnimationFrame(() => scrollToBottom(true))
            } else if (incoming.sender_id !== user.id) {
              setShowJumpNew(true)
            }
          }
        },
      )
      .subscribe((status) => {
        if (cancelled) return
        if (status === 'SUBSCRIBED') {
          setConn(navigator.onLine ? 'live' : 'offline')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConn('reconnecting')
        }
      })

    const onOffline = () => setConn('offline')
    const onOnline = () => setConn('reconnecting')
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)

    return () => {
      cancelled = true
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
      void supabase.removeChannel(channel)
    }
  }, [user, conversationId, applyInboxMessage, scrollToBottom])

  // Load open conversation + per-conversation channel (filtered) + gap refill on subscribe
  useEffect(() => {
    if (!user || !conversationId || conversationMissing) {
      setMessages([])
      setLoadingChat(false)
      setHasOlderMessages(false)
      setReplyTo(null)
      lastSeenAtRef.current = null
      return
    }

    let cancelled = false
    setLoadingChat(true)
    setSendError(null)
    setShowJumpNew(false)
    stickToBottomRef.current = true

    ;(async () => {
      const { rows, error: qError, rawCount } = await fetchMessagesPage({
        conversationId,
        rangeTo: PAGE_SIZE.messages - 1,
      })
      if (cancelled) return
      if (qError) setError(qError)
      else {
        setMessages(rows)
        setHasOlderMessages(hasMoreRows(rawCount, PAGE_SIZE.messages))
        lastSeenAtRef.current = rows.at(-1)?.created_at ?? null
        requestAnimationFrame(() => scrollToBottom(false))
      }
      setLoadingChat(false)
    })()

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id.eq.${conversationId}`,
        },
        (payload) => {
          const incoming = normalizeMessageRow(payload.new as Record<string, unknown>)
          setMessages((prev) => mergeIncomingMessage(prev, incoming))
          lastSeenAtRef.current = incoming.created_at
          const el = listRef.current
          if (el && (stickToBottomRef.current || isNearBottom(el))) {
            requestAnimationFrame(() => scrollToBottom(true))
          } else if (incoming.sender_id !== user.id) {
            setShowJumpNew(true)
          }
        },
      )
      .subscribe((status) => {
        if (cancelled) return
        if (status === 'SUBSCRIBED') {
          setConn(navigator.onLine ? 'live' : 'offline')
          // Refetch anything missed while disconnected
          const since = lastSeenAtRef.current
          void (async () => {
            let q = supabase
              .from('messages')
              .select(MESSAGE_SELECT)
              .eq('conversation_id', conversationId)
              .order('created_at', { ascending: true })
            if (since) q = q.gt('created_at', since)
            const primary = await q.limit(100)
            let rowsRaw = (primary.data as Record<string, unknown>[] | null) ?? null
            let gapError = primary.error
            if (gapError) {
              let q2 = supabase
                .from('messages')
                .select('id, conversation_id, sender_id, body, created_at, reply_to_id')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: true })
              if (since) q2 = q2.gt('created_at', since)
              const fallback = await q2.limit(100)
              rowsRaw = (fallback.data as Record<string, unknown>[] | null) ?? null
              gapError = fallback.error
            }
            if (cancelled || gapError || !rowsRaw?.length) return
            const rows = rowsRaw.map(normalizeMessageRow)
            setMessages((prev) => {
              let next = prev
              for (const row of rows) next = mergeIncomingMessage(next, row)
              return next
            })
            lastSeenAtRef.current = rows.at(-1)?.created_at ?? lastSeenAtRef.current
          })()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConn('reconnecting')
        }
      })

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [user, conversationId, conversationMissing, fetchMessagesPage, scrollToBottom])

  // Esc cancels reply / menu
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setReplyTo(null)
        setMenuForId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function loadMoreConversations() {
    if (!user) return
    const next = convoPage + 1
    setLoadingMoreConvos(true)
    const { from, to } = rangeForPage(next, PAGE_SIZE.conversations)
    const { data, error: qError } = await supabase
      .from('conversations')
      .select('*, listings(id, title, city, image_urls)')
      .or(`buyer_id.eq.${user.id},owner_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .range(from, to)
    setLoadingMoreConvos(false)
    if (qError) {
      setError(qError.message)
      return
    }
    const rows = await enrichConversations((data ?? []) as Conversation[], user.id)
    setConversations((prev) => sortConversationsByActivity([...prev, ...rows]))
    setConvoPage(next)
    setHasMoreConvos(hasMoreRows((data ?? []).length, PAGE_SIZE.conversations))
  }

  async function loadOlderMessages() {
    if (!conversationId || messages.length === 0) return
    const oldest = messages.find((m) => !isTempMessageId(m.id)) ?? messages[0]
    const el = listRef.current
    const prevHeight = el?.scrollHeight ?? 0
    setLoadingOlder(true)
    const { rows, error: qError, rawCount } = await fetchMessagesPage({
      conversationId,
      before: oldest.created_at,
      rangeTo: PAGE_SIZE.messages - 1,
    })
    setLoadingOlder(false)
    if (qError) {
      setError(qError)
      return
    }
    setMessages((prev) => {
      const ids = new Set(prev.map((m) => m.id))
      const older = rows.filter((r) => !ids.has(r.id))
      return [...older, ...prev]
    })
    setHasOlderMessages(hasMoreRows(rawCount, PAGE_SIZE.messages))
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevHeight
    })
  }

  function onListScroll() {
    const el = listRef.current
    if (!el) return
    const near = isNearBottom(el)
    stickToBottomRef.current = near
    if (near) setShowJumpNew(false)
    if (el.scrollTop < 48 && hasOlderMessages && !loadingOlder) {
      void loadOlderMessages()
    }
  }

  async function persistMessage(opts: {
    tempId: string
    text: string
    reply: ReplyPreview | null
  }) {
    if (!user || !conversationId) return
    const payload: Record<string, unknown> = {
      conversation_id: conversationId,
      sender_id: user.id,
      body: opts.text,
    }
    if (opts.reply?.id) payload.reply_to_id = opts.reply.id

    const primary = await supabase.from('messages').insert(payload).select(MESSAGE_SELECT).single()
    let savedRow = primary.data as Record<string, unknown> | null
    let insertError = primary.error
    if (insertError) {
      const fallback = await supabase
        .from('messages')
        .insert(payload)
        .select('id, conversation_id, sender_id, body, created_at, reply_to_id')
        .single()
      savedRow = fallback.data as Record<string, unknown> | null
      insertError = fallback.error
    }

    if (insertError || !savedRow) {
      setMessages((prev) => markOptimisticFailed(prev, opts.tempId))
      setSendError(
        friendlyError(
          insertError?.message ?? 'Send failed',
          'Please wait a moment before sending another message.',
        ),
      )
      return
    }

    const saved = normalizeMessageRow(savedRow)
    if (opts.reply && !saved.reply_to) saved.reply_to = opts.reply
    setMessages((prev) => replaceOptimisticWithSaved(prev, opts.tempId, saved))
    applyInboxMessage(saved, user.id, conversationId)
    lastSeenAtRef.current = saved.created_at
    requestAnimationFrame(() => scrollToBottom(true))
  }

  async function sendMessage(e?: FormEvent) {
    e?.preventDefault()
    if (!user || !conversationId) return
    const text = body.trim()
    const validationError = validateMessageBody(body)
    if (validationError) {
      setSendError(validationError)
      return
    }

    const tempId = createTempMessageId()
    const optimistic = buildOptimisticMessage({
      tempId,
      conversationId,
      senderId: user.id,
      body: text,
      replyTo,
    })
    setMessages((prev) => [...prev, optimistic])
    applyInboxMessage(optimistic, user.id, conversationId)
    setBody('')
    setReplyTo(null)
    setSendError(null)
    stickToBottomRef.current = true
    requestAnimationFrame(() => scrollToBottom(true))
    composerRef.current?.focus()

    await persistMessage({ tempId, text, reply: optimistic.reply_to ?? null })
  }

  async function retryFailed(msg: ChatMessage) {
    if (msg.status !== 'failed') return
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, status: 'sending' as const } : m)),
    )
    setSendError(null)
    await persistMessage({
      tempId: msg.id,
      text: msg.body,
      reply: msg.reply_to ?? null,
    })
  }

  function startReply(msg: ChatMessage) {
    if (isTempMessageId(msg.id) || msg.status === 'failed') return
    setReplyTo({
      id: msg.id,
      body: msg.body,
      sender_id: msg.sender_id,
      conversation_id: msg.conversation_id,
    })
    setMenuForId(null)
    composerRef.current?.focus()
  }

  function onComposerKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  if (authLoading) return <p className="text-ink-soft">Checking your account…</p>
  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    )
  }

  const shellClass = `messages-shell ${conversationId ? 'messages-shell--chat-open' : ''}`

  return (
    <div className={shellClass}>
      <div className="mb-3 flex shrink-0 items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">Messages</h1>
          <p className="text-sm text-ink-soft">Chat with buyers and listing owners in real time.</p>
        </div>
        {conn !== 'live' ? (
          <p className="text-xs font-semibold text-amber-800" role="status">
            {conn === 'offline' ? 'Offline' : 'Reconnecting…'}
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="mb-3 shrink-0 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="sr-only" aria-live="polite">
        {liveRegion}
      </div>

      <div className="messages-grid min-h-0 flex-1">
        <aside className="messages-pane messages-list-pane glass-card rounded-2xl">
          <div className="shrink-0 border-b border-line px-4 py-3 font-display font-semibold">
            Conversations
          </div>
          <div className="messages-scroll">
            {loadingList ? (
              <p className="px-4 py-3 text-sm text-ink-soft">Loading…</p>
            ) : (
              <ul>
                {conversations.length === 0 && (
                  <li className="px-4 py-3 text-sm text-ink-soft">
                    No conversations yet. Open a listing and tap Message owner.
                  </li>
                )}
                {conversations.map((c) => {
                  const activeRow = c.id === conversationId
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/messages/${c.id}`)}
                        className={`flex w-full gap-3 px-4 py-3 text-left text-sm transition hover:bg-sand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-gold-dark)] ${
                          activeRow ? 'bg-sand' : ''
                        }`}
                      >
                        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-line">
                          {c.listings?.image_urls?.[0] ? (
                            <ListingImage
                              src={c.listings.image_urls[0]}
                              alt=""
                              size="thumb"
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                          {c.unread ? (
                            <span
                              className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-gold-dark ring-2 ring-white"
                              aria-label="Unread"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="truncate font-medium text-ink">
                              {c.listings?.title ?? 'Listing'}
                            </p>
                            {c.last_activity_at ? (
                              <span className="shrink-0 text-[10px] text-ink-soft">
                                {formatConversationTime(c.last_activity_at)}
                              </span>
                            ) : null}
                          </div>
                          <p className="truncate text-xs text-ink-soft">with {c.other_name}</p>
                          {c.last_preview ? (
                            <p className="mt-0.5 truncate text-xs text-ink-soft">{c.last_preview}</p>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  )
                })}
                {hasMoreConvos ? (
                  <li className="border-t border-line px-4 py-3">
                    <button
                      type="button"
                      disabled={loadingMoreConvos}
                      onClick={() => void loadMoreConversations()}
                      className="w-full text-sm font-semibold text-gold-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-dark)] disabled:opacity-60"
                    >
                      {loadingMoreConvos ? 'Loading…' : 'Load more'}
                    </button>
                  </li>
                ) : null}
              </ul>
            )}
          </div>
        </aside>

        <section className="messages-pane messages-chat-pane glass-card rounded-2xl">
          {!conversationId ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-ink-soft">
              Select a conversation, or message an owner from a listing page.
            </div>
          ) : conversationMissing ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="font-display text-xl font-semibold text-ink">Conversation not found</p>
              <p className="max-w-sm text-sm text-ink-soft">
                This chat may have been removed, or you don&apos;t have access to it.
              </p>
              <Link
                to="/messages"
                className="btn-anim rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-sand"
              >
                Back to Messages
              </Link>
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-start gap-3 border-b border-line px-3 py-3 sm:px-4">
                <Link
                  to="/messages"
                  className="mt-0.5 rounded-lg px-2 py-1 text-sm font-semibold text-gold-dark md:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-dark)]"
                >
                  ← Back
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">
                    {active?.listings?.title ?? 'Chat'}
                  </p>
                  <p className="truncate text-xs text-ink-soft">with {active?.other_name ?? 'User'}</p>
                  {active?.listing_id ? (
                    <Link
                      to={`/listings/${active.listing_id}`}
                      className="text-xs font-medium text-gold-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-dark)]"
                    >
                      View listing
                    </Link>
                  ) : null}
                </div>
              </div>

              <div className="relative min-h-0 flex-1">
                <div
                  ref={listRef}
                  className="messages-scroll space-y-3 p-3 sm:p-4"
                  onScroll={onListScroll}
                >
                  {loadingChat ? (
                    <p className="text-sm text-ink-soft">Loading messages…</p>
                  ) : messages.length === 0 ? (
                    <p className="text-sm text-ink-soft">No messages yet. Say hello.</p>
                  ) : (
                    <>
                      {hasOlderMessages ? (
                        <div className="flex justify-center pb-1">
                          <button
                            type="button"
                            disabled={loadingOlder}
                            onClick={() => void loadOlderMessages()}
                            className="text-xs font-semibold text-gold-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-dark)] disabled:opacity-60"
                          >
                            {loadingOlder ? 'Loading…' : 'Load older messages'}
                          </button>
                        </div>
                      ) : null}
                      <AnimatePresence initial={false}>
                        {messages.map((m) => (
                          <MessageBubble
                            key={m.client_id ?? m.id}
                            message={m}
                            mine={m.sender_id === user.id}
                            reduced={reduced}
                            nameFor={(id) =>
                              id === user.id ? 'You' : nameById.get(id) ?? active?.other_name ?? 'User'
                            }
                            highlighted={highlightId === m.id}
                            menuOpen={menuForId === m.id}
                            onToggleMenu={() =>
                              setMenuForId((id) => (id === m.id ? null : m.id))
                            }
                            onReply={() => startReply(m)}
                            onRetry={() => void retryFailed(m)}
                            onOpenQuote={() => {
                              if (m.reply_to?.id) scrollToMessage(m.reply_to.id)
                            }}
                          />
                        ))}
                      </AnimatePresence>
                    </>
                  )}
                  <div ref={bottomRef} />
                </div>

                {showJumpNew ? (
                  <button
                    type="button"
                    onClick={() => scrollToBottom(true)}
                    className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-sand shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-dark)]"
                  >
                    New messages
                  </button>
                ) : null}
              </div>

              {replyTo ? (
                <div className="flex shrink-0 items-start gap-2 border-t border-line bg-sand/60 px-3 py-2">
                  <div className="min-w-0 flex-1 border-l-2 border-gold pl-2">
                    <p className="text-xs font-semibold text-ink">
                      Replying to{' '}
                      {replyTo.sender_id === user.id
                        ? 'yourself'
                        : nameById.get(replyTo.sender_id) ?? active?.other_name ?? 'User'}
                    </p>
                    <p className="truncate text-xs text-ink-soft">{previewMessageBody(replyTo.body)}</p>
                  </div>
                  <button
                    type="button"
                    aria-label="Cancel reply"
                    onClick={() => setReplyTo(null)}
                    className="rounded-lg px-2 py-1 text-sm font-semibold text-ink-soft hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-dark)]"
                  >
                    ✕
                  </button>
                </div>
              ) : null}

              <form
                onSubmit={(e) => void sendMessage(e)}
                className="shrink-0 border-t border-line bg-white/80 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
              >
                <div className="flex items-end gap-2">
                  <label htmlFor="chat-composer" className="sr-only">
                    Message
                  </label>
                  <textarea
                    id="chat-composer"
                    ref={composerRef}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onKeyDown={onComposerKeyDown}
                    placeholder="Write a message…"
                    maxLength={LIMITS.messageMax}
                    rows={1}
                    className="max-h-32 min-h-[42px] flex-1 resize-y rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-gold focus-visible:ring-2 focus-visible:ring-gold"
                  />
                  <button
                    type="submit"
                    className="btn-anim rounded-xl bg-gold px-4 py-2 font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-dark)]"
                  >
                    Send
                  </button>
                </div>
                {sendError ? <p className="mt-2 text-sm text-red-700">{sendError}</p> : null}
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function MessageBubble(props: {
  message: ChatMessage
  mine: boolean
  reduced: boolean | null
  nameFor: (id: string) => string
  highlighted: boolean
  menuOpen: boolean
  onToggleMenu: () => void
  onReply: () => void
  onRetry: () => void
  onOpenQuote: () => void
}) {
  const {
    message: m,
    mine,
    reduced,
    nameFor,
    highlighted,
    menuOpen,
    onToggleMenu,
    onReply,
    onRetry,
    onOpenQuote,
  } = props
  const touchStartX = useRef<number | null>(null)
  const longPressRef = useRef<number | null>(null)

  function clearLongPress() {
    if (longPressRef.current) {
      window.clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }

  function onPointerDown(e: ReactPointerEvent) {
    if (e.pointerType === 'touch') {
      touchStartX.current = e.clientX
      clearLongPress()
      longPressRef.current = window.setTimeout(() => {
        onToggleMenu()
      }, 480)
    }
  }

  function onPointerUp(e: ReactPointerEvent) {
    clearLongPress()
    if (e.pointerType === 'touch' && touchStartX.current != null) {
      const dx = e.clientX - touchStartX.current
      if (dx > 56) onReply()
    }
    touchStartX.current = null
  }

  const quoteName = m.reply_to ? nameFor(m.reply_to.sender_id) : null

  return (
    <motion.div
      id={`msg-${m.id}`}
      variants={bubbleVariants(reduced, mine)}
      initial="initial"
      animate="animate"
      className={`group relative flex ${mine ? 'justify-end' : 'justify-start'}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={clearLongPress}
      onPointerLeave={clearLongPress}
    >
      {!mine ? (
        <button
          type="button"
          aria-label="Reply"
          onClick={onReply}
          className="absolute -left-1 top-1 hidden rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-ink shadow-sm opacity-0 transition group-hover:opacity-100 md:inline-block focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-dark)]"
        >
          Reply
        </button>
      ) : (
        <button
          type="button"
          aria-label="Reply"
          onClick={onReply}
          className="absolute -right-1 top-1 hidden rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-ink shadow-sm opacity-0 transition group-hover:opacity-100 md:inline-block focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-dark)]"
        >
          Reply
        </button>
      )}

      <div
        className={`max-w-[min(80%,24rem)] rounded-2xl px-3 py-2 text-sm shadow-sm ${
          mine ? 'rounded-br-md bg-ink text-sand' : 'rounded-bl-md bg-sand text-ink'
        } ${highlighted ? 'messages-highlight' : ''} ${m.status === 'sending' ? 'opacity-70' : ''}`}
      >
        {m.reply_to_id ? (
          m.reply_to ? (
            <button
              type="button"
              onClick={onOpenQuote}
              className={`messages-quote w-full text-left ${mine ? 'messages-quote--mine' : ''}`}
            >
              <p className={`text-[11px] font-semibold ${mine ? 'text-sand/90' : 'text-gold-dark'}`}>
                {quoteName}
              </p>
              <p className={`messages-quote-body text-[11px] ${mine ? 'text-sand/75' : 'text-ink-soft'}`}>
                {m.reply_to.body}
              </p>
            </button>
          ) : (
            <p className={`mb-1 text-[11px] italic ${mine ? 'text-sand/70' : 'text-ink-soft'}`}>
              Original message unavailable
            </p>
          )
        ) : null}

        <p className="messages-bubble-text">{m.body}</p>
        <div className={`mt-1 flex items-center gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
          <p className={`text-[10px] ${mine ? 'text-sand/70' : 'text-ink-soft'}`}>
            {formatMessageTime(m.created_at)}
            {m.status === 'sending' ? ' · Sending…' : ''}
          </p>
          <button
            type="button"
            aria-label="Message actions"
            aria-expanded={menuOpen}
            onClick={onToggleMenu}
            className={`rounded px-1 text-[11px] font-bold leading-none ${
              mine ? 'text-sand/80 hover:text-sand' : 'text-ink-soft hover:text-ink'
            } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-dark)]`}
          >
            ···
          </button>
        </div>

        {m.status === 'failed' ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 text-[11px] font-semibold text-red-300 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-dark)]"
          >
            Failed, tap to retry
          </button>
        ) : null}

        {menuOpen ? (
          <div className="mt-2 flex gap-2 border-t border-white/20 pt-2">
            <button
              type="button"
              onClick={onReply}
              className={`text-[11px] font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold-dark)] ${
                mine ? 'text-sand' : 'text-ink'
              }`}
            >
              Reply
            </button>
          </div>
        ) : null}
      </div>
    </motion.div>
  )
}
