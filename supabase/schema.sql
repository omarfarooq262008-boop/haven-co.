-- Haven & Co. — Supabase schema
-- Run this entire file in the Supabase Dashboard → SQL Editor → New query → Run

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (full_name is null or char_length(full_name) <= 120),
  phone text check (phone is null or char_length(phone) <= 40),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 120),
  description text not null default '' check (char_length(trim(description)) between 20 and 5000),
  price numeric(12, 2) not null check (price > 0),
  city text not null check (char_length(trim(city)) between 1 and 80),
  address text not null default '' check (char_length(address) <= 200),
  property_type text not null check (property_type in ('apartment', 'villa', 'townhouse', 'commercial', 'other')),
  listing_type text not null default 'sale' check (listing_type in ('sale', 'rent')),
  bedrooms int not null default 0 check (bedrooms >= 0),
  bathrooms int not null default 0 check (bathrooms >= 0),
  area_sqft numeric(12, 2) check (area_sqft is null or area_sqft >= 0),
  image_urls text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists listings_owner_id_idx on public.listings (owner_id);
create index if not exists listings_city_idx on public.listings (city);
create index if not exists listings_status_idx on public.listings (status);
create index if not exists listings_listing_type_idx on public.listings (listing_type);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  buyer_id uuid not null references auth.users (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (listing_id, buyer_id)
);

create index if not exists conversations_buyer_id_idx on public.conversations (buyer_id);
create index if not exists conversations_owner_id_idx on public.conversations (owner_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  reply_to_id uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_id_idx on public.messages (conversation_id, created_at);
create index if not exists messages_reply_to_id_idx on public.messages (reply_to_id) where reply_to_id is not null;

create table if not exists public.message_email_cooldowns (
  conversation_id uuid primary key references public.conversations (id) on delete cascade,
  last_emailed_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  visitor_id uuid references auth.users (id) on delete set null,
  visitor_name text not null check (char_length(trim(visitor_name)) between 1 and 120),
  visitor_email text not null check (char_length(trim(visitor_email)) between 3 and 254),
  visitor_phone text not null check (char_length(trim(visitor_phone)) between 3 and 40),
  meeting_at timestamptz not null,
  note text not null default '' check (char_length(note) <= 1000),
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists bookings_listing_id_idx on public.bookings (listing_id);
create index if not exists bookings_owner_id_idx on public.bookings (owner_id);
create index if not exists bookings_visitor_id_idx on public.bookings (visitor_id);
create index if not exists bookings_meeting_at_idx on public.bookings (meeting_at);

drop index if exists bookings_listing_meeting_active_uidx;
create unique index bookings_listing_meeting_active_uidx
  on public.bookings (listing_id, meeting_at)
  where status = 'confirmed';

-- Auto-create a profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.email), 120)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Clients cannot self-promote to admin (SQL Editor can still set is_admin)
create or replace function public.protect_is_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.is_admin is distinct from old.is_admin then
    raise exception 'is_admin can only be changed from the SQL editor';
  end if;
  if tg_op = 'INSERT' and coalesce(new.is_admin, false) = true then
    raise exception 'is_admin cannot be set on insert by clients';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_is_admin_trg on public.profiles;
create trigger protect_is_admin_trg
  before insert or update on public.profiles
  for each row execute function public.protect_is_admin();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- Owners cannot change approval status; admins can
create or replace function public.protect_listing_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.rejection_reason := null;
    return new;
  end if;

  if new.status is distinct from old.status
     or new.rejection_reason is distinct from old.rejection_reason then
    raise exception 'Only admins can change listing status or rejection reason';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_listing_status_trg on public.listings;
create trigger protect_listing_status_trg
  before insert or update on public.listings
  for each row execute function public.protect_listing_status();

create or replace function public.validate_booking_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_row public.listings%rowtype;
begin
  select * into listing_row
  from public.listings
  where id = new.listing_id;

  if not found then
    raise exception 'Listing not found';
  end if;

  new.owner_id := listing_row.owner_id;

  if tg_op = 'INSERT' then
    if listing_row.status is distinct from 'approved' then
      raise exception 'Listing is not available for booking';
    end if;
    if new.visitor_id is not null and new.visitor_id = listing_row.owner_id then
      raise exception 'Owners cannot book their own listing';
    end if;
    if new.meeting_at <= now() then
      raise exception 'Meeting must be in the future';
    end if;
    new.status := 'confirmed';
  end if;

  if tg_op = 'UPDATE' then
    if new.listing_id is distinct from old.listing_id
       or new.owner_id is distinct from old.owner_id
       or new.visitor_id is distinct from old.visitor_id
       or new.visitor_name is distinct from old.visitor_name
       or new.visitor_email is distinct from old.visitor_email
       or new.visitor_phone is distinct from old.visitor_phone
       or new.meeting_at is distinct from old.meeting_at
       or new.note is distinct from old.note then
      raise exception 'Only booking status can be updated';
    end if;
    if new.status is distinct from old.status
       and new.status is distinct from 'cancelled' then
      raise exception 'Invalid booking status change';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_booking_row_trg on public.bookings;
create trigger validate_booking_row_trg
  before insert or update on public.bookings
  for each row execute function public.validate_booking_row();

create or replace function public.get_listing_booked_slots(
  p_listing_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (meeting_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select b.meeting_at
  from public.bookings b
  where b.listing_id = p_listing_id
    and b.status = 'confirmed'
    and b.meeting_at >= p_from
    and b.meeting_at < p_to
  order by b.meeting_at;
$$;

revoke all on function public.get_listing_booked_slots(uuid, timestamptz, timestamptz) from public;
grant execute on function public.get_listing_booked_slots(uuid, timestamptz, timestamptz) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.bookings enable row level security;
alter table public.message_email_cooldowns enable row level security;

revoke all on public.message_email_cooldowns from anon, authenticated;
grant all on public.message_email_cooldowns to service_role;

create or replace function public.try_claim_message_email_cooldown(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_id uuid;
begin
  insert into public.message_email_cooldowns (conversation_id, last_emailed_at)
  values (p_conversation_id, now())
  on conflict (conversation_id) do update
    set last_emailed_at = excluded.last_emailed_at
    where public.message_email_cooldowns.last_emailed_at <= now() - interval '15 minutes'
  returning conversation_id into claimed_id;

  return claimed_id is not null;
end;
$$;

revoke all on function public.try_claim_message_email_cooldown(uuid) from public;
grant execute on function public.try_claim_message_email_cooldown(uuid) to service_role;

-- Profiles: own row (incl. phone); conversation partners (phone masked via profiles_safe)
drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "Users can read conversation partner profiles" on public.profiles;
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

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace view public.profiles_safe
with (security_invoker = true)
as
select
  id,
  full_name,
  created_at,
  case when auth.uid() = id then phone else null end as phone,
  case when auth.uid() = id then is_admin else false end as is_admin
from public.profiles;

grant select on public.profiles_safe to authenticated;

-- Listings: public sees approved; owners see own; admins see all
drop policy if exists "Anyone can read listings" on public.listings;
drop policy if exists "Public and owners can read listings" on public.listings;
create policy "Public and owners can read listings"
  on public.listings for select
  using (
    status = 'approved'
    or owner_id = auth.uid()
    or public.is_admin()
  );

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

drop policy if exists "Admins can update all listings" on public.listings;
create policy "Admins can update all listings"
  on public.listings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Owners can delete their listings" on public.listings;
create policy "Owners can delete their listings"
  on public.listings for delete
  to authenticated
  using (auth.uid() = owner_id or public.is_admin());

-- Conversations
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

-- Messages
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

-- Bookings
drop policy if exists "Visitors can read own bookings" on public.bookings;
create policy "Visitors can read own bookings"
  on public.bookings for select
  to authenticated
  using (auth.uid() = visitor_id);

drop policy if exists "Owners can read listing bookings" on public.bookings;
create policy "Owners can read listing bookings"
  on public.bookings for select
  to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "Authenticated can create own bookings" on public.bookings;
create policy "Authenticated can create own bookings"
  on public.bookings for insert
  to authenticated
  with check (auth.uid() = visitor_id);

drop policy if exists "Participants can cancel bookings" on public.bookings;
create policy "Participants can cancel bookings"
  on public.bookings for update
  to authenticated
  using (auth.uid() = visitor_id or auth.uid() = owner_id)
  with check (auth.uid() = visitor_id or auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- Storage: listing-images (public read; upload/delete only own folder)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-images',
  'listing-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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

-- ---------------------------------------------------------------------------
-- App rate limits (listings / messages / bookings)
-- ---------------------------------------------------------------------------

create or replace function public.enforce_listing_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if auth.uid() is null then
    return new;
  end if;

  select count(*)::int into n
  from public.listings
  where owner_id = auth.uid()
    and created_at > now() - interval '1 day';

  if n >= 10 then
    raise exception
      'You''ve reached the limit of 10 new listings per day. Please try again tomorrow.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_listing_rate_limit_trg on public.listings;
create trigger enforce_listing_rate_limit_trg
  before insert on public.listings
  for each row execute function public.enforce_listing_rate_limit();

create or replace function public.enforce_message_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if auth.uid() is null then
    return new;
  end if;

  select count(*)::int into n
  from public.messages
  where sender_id = auth.uid()
    and created_at > now() - interval '1 minute';

  if n >= 30 then
    raise exception
      'Please wait a moment before sending another message.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_message_rate_limit_trg on public.messages;
create trigger enforce_message_rate_limit_trg
  before insert on public.messages
  for each row execute function public.enforce_message_rate_limit();

create or replace function public.enforce_booking_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if auth.uid() is null then
    return new;
  end if;

  select count(*)::int into n
  from public.bookings
  where visitor_id = auth.uid()
    and created_at > now() - interval '1 hour';

  if n >= 5 then
    raise exception
      'You''ve booked too many meetings recently. Please try again in a bit.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_booking_rate_limit_trg on public.bookings;
create trigger enforce_booking_rate_limit_trg
  before insert on public.bookings
  for each row execute function public.enforce_booking_rate_limit();

create table if not exists public.edge_rate_buckets (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  hit_count int not null default 0
);

alter table public.edge_rate_buckets enable row level security;
revoke all on public.edge_rate_buckets from anon, authenticated;
grant all on public.edge_rate_buckets to service_role;

create or replace function public.check_edge_rate_limit(
  p_key text,
  p_max_hits int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_now timestamptz := clock_timestamp();
  v_window interval := make_interval(secs => greatest(p_window_seconds, 1));
begin
  if p_key is null or length(trim(p_key)) = 0 then
    return false;
  end if;

  insert into public.edge_rate_buckets as b (bucket_key, window_started_at, hit_count)
  values (trim(p_key), v_now, 1)
  on conflict (bucket_key) do update
  set
    window_started_at = case
      when b.window_started_at <= v_now - v_window then v_now
      else b.window_started_at
    end,
    hit_count = case
      when b.window_started_at <= v_now - v_window then 1
      else b.hit_count + 1
    end
  returning b.hit_count into v_count;

  return v_count <= p_max_hits;
end;
$$;

revoke all on function public.check_edge_rate_limit(text, int, int) from public;
grant execute on function public.check_edge_rate_limit(text, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- Message reply same-conversation guard
-- ---------------------------------------------------------------------------

create or replace function public.check_message_reply_same_conversation()
returns trigger
language plpgsql
as $$
begin
  if new.reply_to_id is null then
    return new;
  end if;
  if not exists (
    select 1 from public.messages m
    where m.id = new.reply_to_id and m.conversation_id = new.conversation_id
  ) then
    raise exception 'reply_to_id must reference a message in the same conversation'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists check_message_reply_same_conversation_trg on public.messages;
create trigger check_message_reply_same_conversation_trg
  before insert or update of reply_to_id, conversation_id
  on public.messages
  for each row
  execute function public.check_message_reply_same_conversation();

-- ---------------------------------------------------------------------------
-- Realtime on messages
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
