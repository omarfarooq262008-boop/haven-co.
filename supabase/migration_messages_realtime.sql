-- Haven & Co. — Enable Realtime for public.messages
-- Safe to re-run. Required for live chat without refresh.
--
-- Root cause: schema.sql adds messages to supabase_realtime on fresh installs,
-- but many projects only applied later migrations and never got this publication.

do $$
begin
  if to_regclass('public.messages') is null then
    raise notice 'migration_messages_realtime: public.messages missing — skip';
    return;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
    raise notice 'migration_messages_realtime: added public.messages to supabase_realtime';
  else
    raise notice 'migration_messages_realtime: public.messages already in supabase_realtime';
  end if;
end $$;
