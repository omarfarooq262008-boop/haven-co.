-- Haven & Co. — Launch polish: listing reports + account deletion helper
-- Safe to re-run. Optional tables/functions are guarded with to_regclass /
-- existence checks so this succeeds even if holds or admin helpers are absent.

-- Allow account_deleted on app_events (if table already exists)
do $$
begin
  if to_regclass('public.app_events') is not null then
    alter table public.app_events drop constraint if exists app_events_event_type_check;
    alter table public.app_events
      add constraint app_events_event_type_check
      check (event_type in (
        'listing_approved',
        'listing_rejected',
        'booking_created',
        'email_failed',
        'rate_limit_hit',
        'hold_activated',
        'hold_cancelled',
        'health_check_failed',
        'account_deleted',
        'listing_reported'
      ));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Listing reports (requires listings; admin policies require is_admin())
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.listings') is null then
    raise notice 'migration_launch_polish: public.listings missing — skipping listing_reports';
    return;
  end if;

  create table if not exists public.listing_reports (
    id uuid primary key default gen_random_uuid(),
    listing_id uuid not null references public.listings (id) on delete cascade,
    reporter_id uuid references auth.users (id) on delete set null,
    reason text not null check (char_length(trim(reason)) between 3 and 1000),
    status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
    admin_note text not null default '' check (char_length(admin_note) <= 1000),
    created_at timestamptz not null default now(),
    reviewed_at timestamptz
  );

  create index if not exists listing_reports_listing_id_idx on public.listing_reports (listing_id);
  create index if not exists listing_reports_status_idx on public.listing_reports (status);
  create index if not exists listing_reports_created_at_idx on public.listing_reports (created_at desc);

  -- One open report per reporter per listing
  drop index if exists listing_reports_open_unique_uidx;
  create unique index listing_reports_open_unique_uidx
    on public.listing_reports (listing_id, reporter_id)
    where status = 'open' and reporter_id is not null;

  alter table public.listing_reports enable row level security;

  drop policy if exists "Users can create listing reports" on public.listing_reports;
  drop policy if exists "Users can read own listing reports" on public.listing_reports;
  drop policy if exists "Admins can read listing reports" on public.listing_reports;
  drop policy if exists "Admins can update listing reports" on public.listing_reports;

  create policy "Users can create listing reports"
    on public.listing_reports for insert
    to authenticated
    with check (auth.uid() = reporter_id);

  -- Policies that call is_admin() only if that helper exists (admin migration)
  if to_regprocedure('public.is_admin()') is not null then
    create policy "Users can read own listing reports"
      on public.listing_reports for select
      to authenticated
      using (auth.uid() = reporter_id or public.is_admin());

    create policy "Admins can update listing reports"
      on public.listing_reports for update
      to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  else
    create policy "Users can read own listing reports"
      on public.listing_reports for select
      to authenticated
      using (auth.uid() = reporter_id);

    raise notice 'migration_launch_polish: public.is_admin() missing — admin report policies skipped';
  end if;
end $$;

-- Optional: no-op guard documenting that holds is not required here.
-- (Hold event types above are strings only; holds table lives in migration_holds.sql.)
do $$
begin
  if to_regclass('public.holds') is null then
    raise notice 'migration_launch_polish: public.holds not present — OK (optional)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Delete own account data (storage paths cleaned by Edge Function first)
-- Auth user deletion is done via service role in delete-account function.
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.listings') is null then
    raise notice 'migration_launch_polish: public.listings missing — skipping prepare_account_deletion';
    return;
  end if;

  execute $fn$
    create or replace function public.prepare_account_deletion(p_user_id uuid)
    returns jsonb
    language plpgsql
    security definer
    set search_path = public
    as $body$
    declare
      listing_ids uuid[];
      image_paths text[] := '{}';
      url text;
      listing record;
    begin
      if auth.uid() is distinct from p_user_id and coalesce(auth.role(), '') <> 'service_role' then
        raise exception 'Not allowed';
      end if;

      select coalesce(array_agg(id), '{}') into listing_ids
      from public.listings
      where owner_id = p_user_id;

      for listing in
        select image_urls from public.listings where owner_id = p_user_id
      loop
        if listing.image_urls is not null then
          foreach url in array listing.image_urls
          loop
            -- Extract storage path after /listing-images/ when present
            if position('/listing-images/' in url) > 0 then
              image_paths := array_append(
                image_paths,
                split_part(substring(url from position('/listing-images/' in url) + length('/listing-images/')), '?', 1)
              );
            elsif position('/object/public/listing-images/' in url) > 0 then
              image_paths := array_append(
                image_paths,
                split_part(substring(url from position('/object/public/listing-images/' in url) + length('/object/public/listing-images/')), '?', 1)
              );
            end if;
          end loop;
        end if;
      end loop;

      return jsonb_build_object(
        'user_id', p_user_id,
        'listing_ids', to_jsonb(listing_ids),
        'image_paths', to_jsonb(image_paths)
      );
    end;
    $body$;
  $fn$;

  revoke all on function public.prepare_account_deletion(uuid) from public;
  grant execute on function public.prepare_account_deletion(uuid) to authenticated, service_role;
end $$;
