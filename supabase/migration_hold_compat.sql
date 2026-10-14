-- Haven & Co. — Minimal hold compatibility (feature off)
-- Safe to re-run. Adds listings.hold_status + an empty public.holds table so
-- the live site does not crash when querying hold fields before the full
-- paid-hold stack (migration_holds.sql) is enabled.
--
-- Does NOT enable checkout, fees, cron, or browser mutations.

-- ---------------------------------------------------------------------------
-- listings.hold_status
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.listings') is null then
    raise notice 'migration_hold_compat: public.listings missing — skip hold_status';
    return;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listings'
      and column_name = 'hold_status'
  ) then
    alter table public.listings
      add column hold_status text not null default 'none';
  end if;

  update public.listings
  set hold_status = 'none'
  where hold_status is null
     or hold_status not in ('none', 'on_hold');

  alter table public.listings drop constraint if exists listings_hold_status_check;
  alter table public.listings
    add constraint listings_hold_status_check
    check (hold_status in ('none', 'on_hold'));
end $$;

create index if not exists listings_hold_status_idx
  on public.listings (hold_status);

-- ---------------------------------------------------------------------------
-- Empty holds table (RLS on; browser select-only for participants)
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.listings') is null or to_regclass('public.bookings') is null then
    raise notice 'migration_hold_compat: listings/bookings missing — skip holds table';
    return;
  end if;

  create table if not exists public.holds (
    id uuid primary key default gen_random_uuid(),
    listing_id uuid not null references public.listings (id) on delete cascade,
    booking_id uuid not null references public.bookings (id) on delete cascade,
    visitor_id uuid not null references auth.users (id) on delete cascade,
    amount integer not null default 1 check (amount > 0),
    currency text not null default 'PKR' check (char_length(currency) between 3 and 8),
    status text not null default 'pending_payment'
      check (status in ('pending_payment', 'active', 'expired', 'refunded', 'cancelled')),
    provider text not null default 'mock',
    provider_reference text,
    expires_at timestamptz not null default (now() + interval '48 hours'),
    created_at timestamptz not null default now()
  );
end $$;

create index if not exists holds_listing_id_idx on public.holds (listing_id);
create index if not exists holds_booking_id_idx on public.holds (booking_id);
create index if not exists holds_visitor_id_idx on public.holds (visitor_id);
create index if not exists holds_status_idx on public.holds (status);
create index if not exists holds_expires_at_idx on public.holds (expires_at);

do $$
begin
  if to_regclass('public.holds') is null then
    return;
  end if;

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
end $$;
