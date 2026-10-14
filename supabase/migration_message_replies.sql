-- Haven & Co. — Message replies (WhatsApp-style quote)
-- Safe to re-run. Keeps existing RLS; adds same-conversation check.

do $$
begin
  if to_regclass('public.messages') is null then
    raise notice 'migration_message_replies: public.messages missing — skip';
    return;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'reply_to_id'
  ) then
    alter table public.messages
      add column reply_to_id uuid references public.messages (id) on delete set null;
  end if;
end $$;

create index if not exists messages_reply_to_id_idx
  on public.messages (reply_to_id)
  where reply_to_id is not null;

-- Ensure replied-to message is in the same conversation
create or replace function public.check_message_reply_same_conversation()
returns trigger
language plpgsql
as $$
begin
  if new.reply_to_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.messages m
    where m.id = new.reply_to_id
      and m.conversation_id = new.conversation_id
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

-- Existing INSERT RLS still applies (body length, rate limits, participant check).
-- No new client UPDATE/DELETE policies (replies are set only on insert).
