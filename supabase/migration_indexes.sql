-- Haven & Co. — Query-oriented indexes for growth
-- Paste into Supabase → SQL Editor → Run
-- Safe to re-run (IF NOT EXISTS + table-existence guards).
--
-- Each index is created only when its table exists (to_regclass), so this
-- file succeeds whether or not optional tables (holds, listing_reports, …)
-- have been migrated yet.
--
-- Based on frontend query shapes:
--   listings: status + listing_type + created_at (home grid)
--   listings: city / price / property_type filters; owner_id (my listings)
--   messages: conversation_id + created_at (chat history)
--   bookings: listing_id + meeting_at; visitor_id / owner_id (my bookings)
--   conversations: buyer_id / owner_id lists
--   listing_reports: status + created_at (admin)

-- ---------------------------------------------------------------------------
-- Listings (marketplace browse + owner dashboards)
-- ---------------------------------------------------------------------------

do $$ begin
  if to_regclass('public.listings') is not null then
    -- Home: .eq(status,'approved').eq(listing_type,...).order(created_at desc)
    create index if not exists listings_status_type_created_idx
      on public.listings (status, listing_type, created_at desc);

    -- Pending admin queue: .eq(status,'pending').order(created_at asc)
    create index if not exists listings_status_created_idx
      on public.listings (status, created_at);

    -- Filters: city (ilike still needs scan; btree helps equality / prefix via lower)
    create index if not exists listings_city_lower_idx
      on public.listings (lower(city));

    create index if not exists listings_price_idx
      on public.listings (price);

    create index if not exists listings_property_type_idx
      on public.listings (property_type);

    -- Approved + type + price range (common filter combo)
    create index if not exists listings_approved_type_price_idx
      on public.listings (listing_type, price)
      where status = 'approved';

    -- My listings: .eq(owner_id).order(created_at desc)
    create index if not exists listings_owner_created_idx
      on public.listings (owner_id, created_at desc);

    -- Ensure single-column helpers exist even on older DBs
    create index if not exists listings_status_idx on public.listings (status);
    create index if not exists listings_listing_type_idx on public.listings (listing_type);
    create index if not exists listings_city_idx on public.listings (city);
    create index if not exists listings_created_at_idx on public.listings (created_at desc);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Messages & conversations
-- ---------------------------------------------------------------------------

do $$ begin
  if to_regclass('public.messages') is not null then
    -- Chat history: .eq(conversation_id).order(created_at)
    create index if not exists messages_conversation_created_idx
      on public.messages (conversation_id, created_at);

    create index if not exists messages_created_at_idx
      on public.messages (created_at);
  end if;
end $$;

do $$ begin
  if to_regclass('public.conversations') is not null then
    create index if not exists conversations_buyer_created_idx
      on public.conversations (buyer_id, created_at desc);

    create index if not exists conversations_owner_created_idx
      on public.conversations (owner_id, created_at desc);

    create index if not exists conversations_listing_buyer_idx
      on public.conversations (listing_id, buyer_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------

do $$ begin
  if to_regclass('public.bookings') is not null then
    create index if not exists bookings_listing_meeting_idx
      on public.bookings (listing_id, meeting_at);

    create index if not exists bookings_meeting_at_idx
      on public.bookings (meeting_at);

    create index if not exists bookings_visitor_meeting_idx
      on public.bookings (visitor_id, meeting_at);

    create index if not exists bookings_owner_meeting_idx
      on public.bookings (owner_id, meeting_at);

    create index if not exists bookings_status_meeting_idx
      on public.bookings (status, meeting_at);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Admin reports / holds (optional tables)
-- ---------------------------------------------------------------------------

do $$ begin
  if to_regclass('public.listing_reports') is not null then
    create index if not exists listing_reports_status_created_idx
      on public.listing_reports (status, created_at);
  end if;
end $$;

do $$ begin
  if to_regclass('public.holds') is not null then
    create index if not exists holds_visitor_created_idx
      on public.holds (visitor_id, created_at desc);
  end if;
end $$;
