-- Add Buy / Rent support to listings
-- Run in Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run: uses IF NOT EXISTS / DO blocks. Does not change RLS policies.

alter table public.listings
  add column if not exists listing_type text;

update public.listings
set listing_type = 'sale'
where listing_type is null;

alter table public.listings
  alter column listing_type set default 'sale';

alter table public.listings
  alter column listing_type set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'listings_listing_type_check'
      and conrelid = 'public.listings'::regclass
  ) then
    alter table public.listings
      add constraint listings_listing_type_check
      check (listing_type in ('sale', 'rent'));
  end if;
end $$;

create index if not exists listings_listing_type_idx on public.listings (listing_type);
