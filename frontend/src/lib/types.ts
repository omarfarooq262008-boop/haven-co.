export type PropertyType = 'apartment' | 'villa' | 'townhouse' | 'commercial' | 'other'
export type ListingType = 'sale' | 'rent'
export type ListingStatus = 'pending' | 'approved' | 'rejected'
export type ListingHoldStatus = 'none' | 'on_hold'
export type MarketSection = 'buy' | 'rent'

export type Profile = {
  id: string
  full_name: string | null
  phone: string | null
  is_admin?: boolean
  created_at?: string
}

export type Listing = {
  id: string
  owner_id: string
  title: string
  description: string
  price: number
  city: string
  address: string
  property_type: PropertyType
  listing_type: ListingType
  bedrooms: number
  bathrooms: number
  area_sqft: number | null
  image_urls: string[]
  status: ListingStatus
  hold_status?: ListingHoldStatus
  rejection_reason?: string | null
  created_at: string
}

export type Conversation = {
  id: string
  listing_id: string
  buyer_id: string
  owner_id: string
  created_at: string
  listings?: Pick<Listing, 'id' | 'title' | 'city' | 'image_urls'> | null
  /** Other participant display name (filled on client) */
  other_name?: string
  /** Latest message preview (client) */
  last_preview?: string
  last_activity_at?: string
  unread?: boolean
}

export type Message = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
  reply_to_id?: string | null
}

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled'

export type Booking = {
  id: string
  listing_id: string
  owner_id: string
  visitor_id: string | null
  visitor_name: string
  visitor_email: string
  visitor_phone: string
  meeting_at: string
  note: string
  status: BookingStatus
  created_at: string
  listings?: Pick<Listing, 'id' | 'title' | 'city' | 'address' | 'image_urls'> | null
}

export type HoldRow = {
  id: string
  listing_id: string
  booking_id: string
  visitor_id: string
  amount: number
  currency: string
  status: 'pending_payment' | 'active' | 'expired' | 'refunded' | 'cancelled'
  provider: string
  provider_reference: string | null
  expires_at: string
  created_at: string
}
