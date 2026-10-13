import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LIMITS, validateMessageBody } from '../lib/listingForm'
import { bubbleVariants } from '../lib/motion'
import { ListingImage } from '../components/ListingImage'
import { friendlyError } from '../lib/errors'
import { formatMessageTime } from '../lib/messaging'
import { hasMoreRows, PAGE_SIZE, rangeForPage } from '../lib/pagination'
import { supabase } from '../lib/supabase'
import type { Conversation, Message, Profile } from '../lib/types'

export function MessagesPage() {
  const { conversationId } = useParams()
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const bottomRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [body, setBody] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingChat, setLoadingChat] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [loadingMoreConvos, setLoadingMoreConvos] = useState(false)
  const [convoPage, setConvoPage] = useState(0)
  const [hasMoreConvos, setHasMoreConvos] = useState(false)
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [ensureDone, setEnsureDone] = useState(false)
  const skipScrollRef = useRef(false)

  const active = useMemo(
    () => conversations.find((c) => c.id === conversationId) ?? null,
    [conversations, conversationId],
  )
  const conversationMissing =
    Boolean(conversationId) && !loadingList && ensureDone && !active

  async function enrichConversations(rows: Conversation[], uid: string): Promise<Conversation[]> {
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
      return { ...c, other_name: names.get(otherId) ?? 'User' }
    })
  }

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

      const rows = (data ?? []) as Conversation[]
      if (cancelled) return
      setConversations(await enrichConversations(rows, user.id))
      setHasMoreConvos(hasMoreRows(rows.length, PAGE_SIZE.conversations))
      setLoadingList(false)
    })()

    return () => {
      cancelled = true
    }
  }, [user])

  // Pull in a deep-linked conversation if it is outside the first page
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
  }, [user, conversationId, loadingList])

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
    const rows = (data ?? []) as Conversation[]
    const enriched = await enrichConversations(rows, user.id)
    setConversations((prev) => [...prev, ...enriched])
    setConvoPage(next)
    setHasMoreConvos(hasMoreRows(rows.length, PAGE_SIZE.conversations))
  }

  useEffect(() => {
    if (!user || !conversationId || conversationMissing) {
      setMessages([])
      setLoadingChat(false)
      setHasOlderMessages(false)
      return
    }

    let cancelled = false
    setLoadingChat(true)
    setSendError(null)
    setHasOlderMessages(false)

    ;(async () => {
      // Newest page first so chat opens near the latest messages
      const { from, to } = rangeForPage(0, PAGE_SIZE.messages)
      const { data, error: qError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .range(from, to)

      if (cancelled) return
      if (qError) setError(qError.message)
      else {
        const rows = ((data ?? []) as Message[]).slice().reverse()
        setMessages(rows)
        setHasOlderMessages(hasMoreRows((data ?? []).length, PAGE_SIZE.messages))
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
          const next = payload.new as Message
          setMessages((prev) => (prev.some((m) => m.id === next.id) ? prev : [...prev, next]))
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [user, conversationId, conversationMissing])

  async function loadOlderMessages() {
    if (!conversationId || messages.length === 0) return
    const oldest = messages[0]
    setLoadingOlder(true)
    skipScrollRef.current = true
    const { data, error: qError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .range(0, PAGE_SIZE.messages - 1)
    setLoadingOlder(false)
    if (qError) {
      setError(qError.message)
      return
    }
    const older = ((data ?? []) as Message[]).slice().reverse()
    setMessages((prev) => [...older, ...prev])
    setHasOlderMessages(hasMoreRows((data ?? []).length, PAGE_SIZE.messages))
  }

  useEffect(() => {
    if (skipScrollRef.current) {
      skipScrollRef.current = false
      return
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, conversationId])

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

  async function sendMessage(e: FormEvent) {
    e.preventDefault()
    if (!user || !conversationId) return
    const text = body.trim()
    const validationError = validateMessageBody(body)
    if (validationError) {
      setSendError(validationError)
      return
    }

    setSending(true)
    setSendError(null)
    setBody('')

    const { error: insertError } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body: text,
    })

    setSending(false)
    if (insertError) {
      setBody(text)
      setSendError(
        friendlyError(insertError.message, 'Please wait a moment before sending another message.'),
      )
    }
  }

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-2xl px-5 py-4">
        <h1 className="font-display text-3xl font-bold text-ink">Messages</h1>
        <p className="mt-1 text-sm text-ink-soft">Chat with buyers and listing owners in real time.</p>
      </div>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
      )}

      <div className="grid min-h-[65vh] gap-4 md:grid-cols-[300px_1fr]">
        <aside className="glass-card overflow-hidden rounded-2xl">
          <div className="border-b border-line px-4 py-3 font-display font-semibold">Conversations</div>
          {loadingList ? (
            <p className="px-4 py-3 text-sm text-ink-soft">Loading…</p>
          ) : (
            <ul className="max-h-[65vh] overflow-auto">
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
                      className={`flex w-full gap-3 px-4 py-3 text-left text-sm transition hover:bg-sand ${
                        activeRow ? 'bg-sand' : ''
                      }`}
                    >
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-line">
                        {c.listings?.image_urls?.[0] ? (
                          <ListingImage
                            src={c.listings.image_urls[0]}
                            alt=""
                            size="thumb"
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{c.listings?.title ?? 'Listing'}</p>
                        <p className="truncate text-xs text-ink-soft">with {c.other_name}</p>
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
                    className="w-full text-sm font-semibold text-gold-dark disabled:opacity-60"
                  >
                    {loadingMoreConvos ? 'Loading…' : 'Load more'}
                  </button>
                </li>
              ) : null}
            </ul>
          )}
        </aside>

        <section className="glass-card flex min-h-[65vh] flex-col overflow-hidden rounded-2xl">
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
              <div className="border-b border-line px-4 py-3">
                <p className="font-semibold text-ink">{active?.listings?.title ?? 'Chat'}</p>
                <p className="text-xs text-ink-soft">with {active?.other_name ?? 'User'}</p>
                {active?.listing_id && (
                  <Link to={`/listings/${active.listing_id}`} className="text-xs font-medium text-gold-dark">
                    View listing
                  </Link>
                )}
              </div>

              <div className="flex-1 space-y-3 overflow-auto p-4">
                {loadingChat ? (
                  <p className="text-sm text-ink-soft">Loading messages…</p>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-ink-soft">No messages yet. Say hello.</p>
                ) : (
                  <>
                    {hasOlderMessages ? (
                      <div className="flex justify-center pb-2">
                        <button
                          type="button"
                          disabled={loadingOlder}
                          onClick={() => void loadOlderMessages()}
                          className="text-xs font-semibold text-gold-dark disabled:opacity-60"
                        >
                          {loadingOlder ? 'Loading…' : 'Load older messages'}
                        </button>
                      </div>
                    ) : null}
                    <AnimatePresence initial={false}>
                      {messages.map((m) => {
                        const mine = m.sender_id === user.id
                        return (
                          <motion.div
                            key={m.id}
                            variants={bubbleVariants(reduced, mine)}
                            initial="initial"
                            animate="animate"
                            className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                                mine
                                  ? 'rounded-br-md bg-ink text-sand'
                                  : 'rounded-bl-md bg-sand text-ink'
                              }`}
                            >
                              <p className="whitespace-pre-wrap break-words">{m.body}</p>
                              <p className={`mt-1 text-[10px] ${mine ? 'text-sand/70' : 'text-ink-soft'}`}>
                                {formatMessageTime(m.created_at)}
                              </p>
                            </div>
                          </motion.div>
                        )
                      })}
                    </AnimatePresence>
                  </>
                )}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={sendMessage} className="border-t border-line p-3">
                <div className="flex gap-2">
                  <input
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Write a message…"
                    maxLength={LIMITS.messageMax}
                    disabled={sending}
                    className="flex-1 rounded border border-line px-3 py-2 outline-none focus:border-gold disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={sending}
                    className="btn-anim rounded bg-gold px-4 py-2 font-semibold text-ink disabled:opacity-60"
                  >
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
                {sendError && <p className="mt-2 text-sm text-red-700">{sendError}</p>}
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
