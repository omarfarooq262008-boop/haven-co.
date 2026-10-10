import { supabase } from './supabase'

/** Create a conversation with the listing owner, or return the existing one. */
export async function createOrOpenConversation(opts: {
  listingId: string
  buyerId: string
  ownerId: string
}) {
  const { listingId, buyerId, ownerId } = opts

  if (buyerId === ownerId) {
    return { conversationId: null as string | null, error: 'You cannot message yourself.' }
  }

  const { data: existing, error: existingError } = await supabase
    .from('conversations')
    .select('id')
    .eq('listing_id', listingId)
    .eq('buyer_id', buyerId)
    .maybeSingle()

  if (existingError) return { conversationId: null, error: existingError.message }
  if (existing) return { conversationId: existing.id as string, error: null }

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      listing_id: listingId,
      buyer_id: buyerId,
      owner_id: ownerId,
    })
    .select('id')
    .single()

  if (error) return { conversationId: null, error: error.message }
  return { conversationId: data.id as string, error: null }
}

export function formatMessageTime(iso: string) {
  const date = new Date(iso)
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}
