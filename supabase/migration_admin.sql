-- Haven & Co. — Admin approval for listings
-- Paste into Supabase → SQL Editor → Run
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Profiles: is_admin
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Prevent clients from flipping is_admin on themselves (or anyone)
create or replace function public.protect_is_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Allow SQL Editor / service role (no JWT). Block authenticated clients.
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

-- Helper used in RLS
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

-- Refresh safe profile view (phone + is_admin only for self)
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

-- ---------------------------------------------------------------------------
-- Listings: approval status + rejection reason
-- ---------------------------------------------------------------------------

alter table public.listings
  add column if not exists rejection_reason text;

alter table public.listings drop constraint if exists listings_rejection_reason_len;
alter table public.listings
  add constraint listings_rejection_reason_len
  check (rejection_reason is null or char_length(rejection_reason) <= 500);

-- Migrate old statuses → approved, then lock to pending|approved|rejected
alter table public.listings drop constraint if exists listings_status_check;

update public.listings
set status = 'approved'
where status is distinct from 'approved';

alter table public.listings
  alter column status set default 'pending';

alter table public.listings
  add constraint listings_status_check
  check (status in ('pending', 'approved', 'rejected'));

-- Owners cannot change status / rejection_reason; admins can
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

-- ---------------------------------------------------------------------------
-- Listings RLS
-- ---------------------------------------------------------------------------

drop policy if exists "Anyone can read listings" on public.listings;
drop policy if exists "Public and owners can read listings" on public.listings;
drop policy if exists "Authenticated users can insert own listings" on public.listings;
drop policy if exists "Owners can update their listings" on public.listings;
drop policy if exists "Owners can delete their listings" on public.listings;
drop policy if exists "Admins can update all listings" on public.listings;
drop policy if exists "Admins can delete all listings" on public.listings;

-- Public: approved only. Owners: own rows. Admins: all.
create policy "Public and owners can read listings"
  on public.listings for select
  using (
    status = 'approved'
    or owner_id = auth.uid()
    or public.is_admin()
  );

-- Insert only as yourself (trigger forces status = pending)
create policy "Authenticated users can insert own listings"
  on public.listings for insert
  to authenticated
  with check (auth.uid() = owner_id);

-- Owners update own content (trigger blocks status changes)
create policy "Owners can update their listings"
  on public.listings for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Admins update any listing (approve / reject)
create policy "Admins can update all listings"
  on public.listings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Owners can delete their listings"
  on public.listings for delete
  to authenticated
  using (auth.uid() = owner_id or public.is_admin());
