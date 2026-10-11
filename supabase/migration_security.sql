-- Haven & Co. — Security hardening
-- Paste this entire file into Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run. Does not drop tables or remove listing_type.

-- ---------------------------------------------------------------------------
-- 1) CHECK constraints: positive price + length limits
-- ---------------------------------------------------------------------------

-- Price must be positive (was >= 0)
alter table public.listings drop constraint if exists listings_price_check;
alter table public.listings
  add constraint listings_price_check check (price > 0);

alter table public.listings drop constraint if exists listings_title_len;
alter table public.listings
  add constraint listings_title_len
  check (char_length(trim(title)) between 3 and 120);

alter table public.listings drop constraint if exists listings_description_len;
alter table public.listings
  add constraint listings_description_len
  check (char_length(trim(description)) between 20 and 5000);

alter table public.listings drop constraint if exists listings_city_len;
alter table public.listings
  add constraint listings_city_len
  check (char_length(trim(city)) between 1 and 80);

alter table public.listings drop constraint if exists listings_address_len;
alter table public.listings
  add constraint listings_address_len
  check (char_length(address) <= 200);

alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages
  add constraint messages_body_check
  check (char_length(trim(body)) between 1 and 2000);

alter table public.profiles drop constraint if exists profiles_full_name_len;
alter table public.profiles
  add constraint profiles_full_name_len
  check (full_name is null or char_length(full_name) <= 120);

alter table public.profiles drop constraint if exists profiles_phone_len;
alter table public.profiles
  add constraint profiles_phone_len
  check (phone is null or char_length(phone) <= 40);

-- ---------------------------------------------------------------------------
-- 2) Profiles RLS: not world-readable; phone only for yourself
-- ---------------------------------------------------------------------------

drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can read conversation partner profiles" on public.profiles;

-- Own row: full access (including phone)
create policy "Users can read own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

-- Conversation partners: can see the row, but phone is masked via profiles_safe view
create policy "Users can read conversation partner profiles"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.conversations c
      where (c.buyer_id = auth.uid() and c.owner_id = profiles.id)
         or (c.owner_id = auth.uid() and c.buyer_id = profiles.id)
    )
  );

-- Safe read surface: phone only when reading your own row
create or replace view public.profiles_safe
with (security_invoker = true)
as
select
  id,
  full_name,
  created_at,
  case when auth.uid() = id then phone else null end as phone
from public.profiles;

grant select on public.profiles_safe to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Confirm listings / conversations / messages ownership (re-assert policies)
-- ---------------------------------------------------------------------------

-- Listings: public read OK for marketplace; write only as owner
drop policy if exists "Anyone can read listings" on public.listings;
create policy "Anyone can read listings"
  on public.listings for select
  using (true);

drop policy if exists "Authenticated users can insert own listings" on public.listings;
create policy "Authenticated users can insert own listings"
  on public.listings for insert
  to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "Owners can update their listings" on public.listings;
create policy "Owners can update their listings"
  on public.listings for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "Owners can delete their listings" on public.listings;
create policy "Owners can delete their listings"
  on public.listings for delete
  to authenticated
  using (auth.uid() = owner_id);

-- Conversations: participants only
drop policy if exists "Conversation participants can read" on public.conversations;
create policy "Conversation participants can read"
  on public.conversations for select
  to authenticated
  using (auth.uid() = buyer_id or auth.uid() = owner_id);

drop policy if exists "Buyers can create conversations" on public.conversations;
create policy "Buyers can create conversations"
  on public.conversations for insert
  to authenticated
  with check (
    auth.uid() = buyer_id
    and owner_id = (select l.owner_id from public.listings l where l.id = listing_id)
    and auth.uid() <> owner_id
  );

-- Messages: participants read; send only as yourself
drop policy if exists "Participants can read messages" on public.messages;
create policy "Participants can read messages"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.buyer_id = auth.uid() or c.owner_id = auth.uid())
    )
  );

drop policy if exists "Participants can send messages as themselves" on public.messages;
create policy "Participants can send messages as themselves"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and char_length(trim(body)) between 1 and 2000
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.buyer_id = auth.uid() or c.owner_id = auth.uid())
    )
  );

-- No UPDATE/DELETE on messages or conversations for clients (default deny)

-- ---------------------------------------------------------------------------
-- 4) Storage: upload only into your own folder; delete only your own objects
-- ---------------------------------------------------------------------------

drop policy if exists "Public read listing images" on storage.objects;
create policy "Public read listing images"
  on storage.objects for select
  using (bucket_id = 'listing-images');

drop policy if exists "Authenticated users can upload listing images" on storage.objects;
create policy "Authenticated users can upload listing images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'listing-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update own listing images" on storage.objects;
create policy "Users can update own listing images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'listing-images'
    and auth.uid() = owner
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'listing-images'
    and auth.uid() = owner
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete own listing images" on storage.objects;
create policy "Users can delete own listing images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'listing-images'
    and auth.uid() = owner
    and auth.uid()::text = (storage.foldername(name))[1]
  );
