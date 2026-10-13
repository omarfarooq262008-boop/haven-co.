-- Haven & Co. — Operational event log (app_events)
-- Paste into Supabase → SQL Editor → Run
-- Safe to re-run.

create table if not exists public.app_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null
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
    )),
  source text not null default 'app' check (char_length(trim(source)) between 1 and 80),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_events_created_at_idx on public.app_events (created_at desc);
create index if not exists app_events_event_type_idx on public.app_events (event_type);
create index if not exists app_events_type_created_idx on public.app_events (event_type, created_at desc);

alter table public.app_events enable row level security;

-- Nobody reads/writes from the browser via direct table access
drop policy if exists "Admins can read app_events" on public.app_events;
create policy "Admins can read app_events"
  on public.app_events for select
  to authenticated
  using (public.is_admin());

-- Insert only through security-definer helper (service role / Edge / allowed client events)

create or replace function public.scrub_event_metadata(p_meta jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  result jsonb := '{}'::jsonb;
  key text;
  val jsonb;
  blocked text[] := array[
    'email', 'e-mail', 'phone', 'mobile', 'tel', 'password', 'token', 'secret',
    'authorization', 'visitor_email', 'visitor_phone', 'visitor_name', 'full_name',
    'html', 'body', 'message', 'note', 'card', 'pan'
  ];
begin
  if p_meta is null or jsonb_typeof(p_meta) <> 'object' then
    return '{}'::jsonb;
  end if;

  for key, val in select * from jsonb_each(p_meta)
  loop
    if lower(key) = any (blocked) then
      result := result || jsonb_build_object(key, '[Filtered]');
    elsif jsonb_typeof(val) = 'string' and char_length(val #>> '{}') > 500 then
      result := result || jsonb_build_object(key, left(val #>> '{}', 500));
    else
      result := result || jsonb_build_object(key, val);
    end if;
  end loop;

  return result;
end;
$$;

create or replace function public.log_app_event(
  p_event_type text,
  p_source text default 'app',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  src text := left(trim(coalesce(p_source, 'app')), 80);
begin
  if src is null or src = '' then
    src := 'app';
  end if;

  insert into public.app_events (event_type, source, metadata)
  values (
    p_event_type,
    src,
    public.scrub_event_metadata(coalesce(p_metadata, '{}'::jsonb))
  )
  returning id into new_id;

  return new_id;
exception
  when check_violation then
    raise exception 'Invalid app_events event_type: %', p_event_type;
end;
$$;

revoke all on function public.log_app_event(text, text, jsonb) from public;
grant execute on function public.log_app_event(text, text, jsonb) to authenticated, service_role;

comment on table public.app_events is
  'Operational events for monitoring (approvals, bookings, email failures, rate limits). No secrets/PII.';
