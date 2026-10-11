-- Haven & Co. — Book a meeting
-- Paste into Supabase → SQL Editor → Run
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

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

-- Two active (confirmed) bookings cannot share the same listing + slot
drop index if exists bookings_listing_meeting_active_uidx;
create unique index bookings_listing_meeting_active_uidx
  on public.bookings (listing_id, meeting_at)
  where status = 'confirmed';

-- ---------------------------------------------------------------------------
-- Insert validation (owner from listing, future only, not own listing)
-- ---------------------------------------------------------------------------

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
    -- Only status may change (cancel); keep other fields immutable
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

-- Busy slots for the booking UI (no PII)
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
-- RLS
-- ---------------------------------------------------------------------------

alter table public.bookings enable row level security;

drop policy if exists "Visitors can read own bookings" on public.bookings;
drop policy if exists "Owners can read listing bookings" on public.bookings;
drop policy if exists "Authenticated can create own bookings" on public.bookings;
drop policy if exists "Participants can cancel bookings" on public.bookings;

create policy "Visitors can read own bookings"
  on public.bookings for select
  to authenticated
  using (auth.uid() = visitor_id);

create policy "Owners can read listing bookings"
  on public.bookings for select
  to authenticated
  using (auth.uid() = owner_id);

create policy "Authenticated can create own bookings"
  on public.bookings for insert
  to authenticated
  with check (auth.uid() = visitor_id);

create policy "Participants can cancel bookings"
  on public.bookings for update
  to authenticated
  using (auth.uid() = visitor_id or auth.uid() = owner_id)
  with check (auth.uid() = visitor_id or auth.uid() = owner_id);
