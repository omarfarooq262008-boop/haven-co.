-- Haven & Co. — Application rate limits
-- Paste into Supabase → SQL Editor → Run
-- Safe to re-run.
--
-- Limits (per authenticated user):
--   listings : 10 per day
--   messages : 30 per minute
--   bookings : 5 per hour
--
-- Edge Functions also use edge_rate_buckets via check_edge_rate_limit().

-- ---------------------------------------------------------------------------
-- Listing / message / booking triggers
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

-- ---------------------------------------------------------------------------
-- Edge Function request buckets (IP + user)
-- ---------------------------------------------------------------------------

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
