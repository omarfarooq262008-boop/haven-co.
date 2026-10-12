-- Haven & Co. — Paid property holds
-- Paste into Supabase → SQL Editor → Run
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Platform config (single hold fee — change here)
-- ---------------------------------------------------------------------------

create table if not exists public.platform_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.platform_config (key, value)
values ('hold_fee_pkr', '5000')
on conflict (key) do nothing;

alter table public.platform_config enable row level security;

drop policy if exists "Anyone can read platform_config" on public.platform_config;
create policy "Anyone can read platform_config"
  on public.platform_config for select
  to anon, authenticated
  using (true);
-- No insert/update/delete from the browser

create or replace function public.get_hold_fee_pkr()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    1,
    coalesce(
      (
        select nullif(trim(value), '')::integer
        from public.platform_config
        where key = 'hold_fee_pkr'
      ),
      5000
    )
  );
$$;

revoke all on function public.get_hold_fee_pkr() from public;
grant execute on function public.get_hold_fee_pkr() to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Listings: hold_status
-- ---------------------------------------------------------------------------

alter table public.listings
  add column if not exists hold_status text not null default 'none';

update public.listings
set hold_status = 'none'
where hold_status is null
   or hold_status not in ('none', 'on_hold');

alter table public.listings drop constraint if exists listings_hold_status_check;
alter table public.listings
  add constraint listings_hold_status_check
  check (hold_status in ('none', 'on_hold'));

create index if not exists listings_hold_status_idx on public.listings (hold_status);

-- Owners / clients cannot change hold_status; service_role, cron, and admins can
create or replace function public.protect_listing_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Internal jobs (expire_holds) and Edge Functions (service_role)
  if current_setting('app.bypass_listing_protect', true) = 'on'
     or coalesce(auth.role(), '') = 'service_role' then
    if tg_op = 'UPDATE' and not public.is_admin() then
      new.status := old.status;
      new.rejection_reason := old.rejection_reason;
    end if;
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.rejection_reason := null;
    new.hold_status := 'none';
    return new;
  end if;

  if new.status is distinct from old.status
     or new.rejection_reason is distinct from old.rejection_reason then
    raise exception 'Only admins can change listing status or rejection reason';
  end if;

  if new.hold_status is distinct from old.hold_status then
    raise exception 'Only the system can change listing hold status';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_listing_status_trg on public.listings;
create trigger protect_listing_status_trg
  before insert or update on public.listings
  for each row execute function public.protect_listing_status();

-- ---------------------------------------------------------------------------
-- Bookings: allow pending (hold awaiting payment)
-- ---------------------------------------------------------------------------

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings
  add constraint bookings_status_check
  check (status in ('pending', 'confirmed', 'cancelled'));

-- Pending and confirmed both reserve the slot
drop index if exists bookings_listing_meeting_active_uidx;
create unique index bookings_listing_meeting_active_uidx
  on public.bookings (listing_id, meeting_at)
  where status in ('pending', 'confirmed');

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

    -- Service role may insert pending holds; clients always get confirmed meetings
    if auth.role() = 'service_role' and new.status = 'pending' then
      null;
    else
      new.status := 'confirmed';
    end if;
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

    if new.status is distinct from old.status then
      if auth.role() = 'service_role' then
        if new.status not in ('pending', 'confirmed', 'cancelled') then
          raise exception 'Invalid booking status change';
        end if;
      elsif new.status is distinct from 'cancelled' then
        raise exception 'Invalid booking status change';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_booking_row_trg on public.bookings;
create trigger validate_booking_row_trg
  before insert or update on public.bookings
  for each row execute function public.validate_booking_row();

-- Busy slots include pending (unpaid hold) and confirmed
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
    and b.status in ('pending', 'confirmed')
    and b.meeting_at >= p_from
    and b.meeting_at < p_to
  order by b.meeting_at;
$$;

revoke all on function public.get_listing_booked_slots(uuid, timestamptz, timestamptz) from public;
grant execute on function public.get_listing_booked_slots(uuid, timestamptz, timestamptz) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Holds table
-- ---------------------------------------------------------------------------

create table if not exists public.holds (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  visitor_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null check (amount > 0),
  currency text not null default 'PKR' check (char_length(currency) between 3 and 8),
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'active', 'expired', 'refunded', 'cancelled')),
  provider text not null default 'mock',
  provider_reference text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Rename if an older draft used bookings_id
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'holds' and column_name = 'bookings_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'holds' and column_name = 'booking_id'
  ) then
    alter table public.holds rename column bookings_id to booking_id;
  end if;
end $$;

create index if not exists holds_listing_id_idx on public.holds (listing_id);
create index if not exists holds_booking_id_idx on public.holds (booking_id);
create index if not exists holds_visitor_id_idx on public.holds (visitor_id);
create index if not exists holds_status_idx on public.holds (status);
create index if not exists holds_expires_at_idx on public.holds (expires_at);
create unique index if not exists holds_provider_reference_uidx
  on public.holds (provider, provider_reference)
  where provider_reference is not null;

-- Only one active or pending hold per listing
drop index if exists holds_one_open_per_listing_uidx;
create unique index holds_one_open_per_listing_uidx
  on public.holds (listing_id)
  where status in ('pending_payment', 'active');

alter table public.holds enable row level security;

drop policy if exists "Visitors can read own holds" on public.holds;
drop policy if exists "Owners can read listing holds" on public.holds;

create policy "Visitors can read own holds"
  on public.holds for select
  to authenticated
  using (auth.uid() = visitor_id);

create policy "Owners can read listing holds"
  on public.holds for select
  to authenticated
  using (
    exists (
      select 1 from public.listings l
      where l.id = holds.listing_id
        and l.owner_id = auth.uid()
    )
  );
-- No insert / update / delete policies → browser cannot mutate holds

-- ---------------------------------------------------------------------------
-- Expire holds past expires_at (pg_cron)
-- ---------------------------------------------------------------------------

create or replace function public.expire_holds()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_count integer := 0;
  r record;
begin
  perform set_config('app.bypass_listing_protect', 'on', true);

  for r in
    select h.id, h.listing_id, h.booking_id
    from public.holds h
    where h.status in ('pending_payment', 'active')
      and h.expires_at <= now()
    for update skip locked
  loop
    update public.holds
    set status = 'expired'
    where id = r.id
      and status in ('pending_payment', 'active');

    update public.bookings
    set status = 'cancelled'
    where id = r.booking_id
      and status in ('pending', 'confirmed');

    -- Free listing only if no other active hold remains
    if not exists (
      select 1 from public.holds
      where listing_id = r.listing_id
        and status = 'active'
        and id is distinct from r.id
    ) then
      update public.listings
      set hold_status = 'none'
      where id = r.listing_id
        and hold_status = 'on_hold';
    end if;

    expired_count := expired_count + 1;
  end loop;

  return expired_count;
end;
$$;

revoke all on function public.expire_holds() from public;
grant execute on function public.expire_holds() to service_role;

create extension if not exists pg_cron with schema extensions;

-- Schedule every 5 minutes (ignore if already scheduled)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'expire-holds') then
      perform cron.schedule('expire-holds', '*/5 * * * *', 'select public.expire_holds()');
    end if;
  end if;
exception
  when others then
    raise notice 'pg_cron schedule skipped: %', sqlerrm;
end $$;
