-- Haven & Co. — Message email notification cooldown
-- Paste into Supabase → SQL Editor → Run
-- Used by Edge Function notify-new-message (max 1 email / conversation / 15 min).

create table if not exists public.message_email_cooldowns (
  conversation_id uuid primary key references public.conversations (id) on delete cascade,
  last_emailed_at timestamptz not null default now()
);

alter table public.message_email_cooldowns enable row level security;

-- No client policies: only the service role (Edge Function) may read/write.
revoke all on public.message_email_cooldowns from anon, authenticated;
grant all on public.message_email_cooldowns to service_role;

-- Atomically claim a send window. Returns true if an email may be sent now.
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
