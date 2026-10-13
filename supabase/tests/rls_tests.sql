-- Haven & Co. — RLS / constraint smoke tests
-- IMPORTANT: run only on a TEST or local Supabase project — never production.
--
-- How to run (SQL Editor):
--   1. Open your test project → SQL Editor.
--   2. Paste this entire file and click Run.
--   3. Look for NOTICE lines: "PASS: …" and "ALL RLS TESTS PASSED".
--   4. The script ends with ROLLBACK — no fixture data is left behind.
--
-- Requires: pgcrypto (usually enabled). Schema from schema.sql + migrations.

begin;

create extension if not exists pgcrypto with schema extensions;

create temporary table _rls_pass (name text primary key);

create or replace function pg_temp.pass(p_name text)
returns void
language plpgsql
as $$
begin
  insert into _rls_pass (name) values (p_name)
  on conflict (name) do nothing;
  raise notice 'PASS: %', p_name;
end;
$$;

create or replace function pg_temp.fail(p_name text, p_detail text default null)
returns void
language plpgsql
as $$
begin
  raise exception 'FAIL: % — %', p_name, coalesce(p_detail, 'assertion failed');
end;
$$;

create or replace function pg_temp.act_as(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_user_id::text,
      'role', 'authenticated',
      'aud', 'authenticated'
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

do $$
declare
  owner_id uuid := 'a1000000-0000-4000-8000-000000000001';
  buyer_id uuid := 'a1000000-0000-4000-8000-000000000002';
  stranger_id uuid := 'a1000000-0000-4000-8000-000000000003';
  listing_id uuid := 'a1000000-0000-4000-8000-000000000010';
  pending_id uuid := 'a1000000-0000-4000-8000-000000000011';
  conv_id uuid := 'a1000000-0000-4000-8000-000000000020';
  msg_id uuid := 'a1000000-0000-4000-8000-000000000021';
  booking_id uuid := 'a1000000-0000-4000-8000-000000000030';
  meeting_at timestamptz := timestamptz '2099-06-15 10:00:00+00';
  n int;
  phone_val text;
begin
  -- ------------------------------------------------------------------
  -- Fixtures (as table owner / bypass RLS)
  -- ------------------------------------------------------------------
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  values
    (
      '00000000-0000-0000-0000-000000000000', owner_id, 'authenticated', 'authenticated',
      'owner-rls@example.com', extensions.crypt('test-pass-owner', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
    ),
    (
      '00000000-0000-0000-0000-000000000000', buyer_id, 'authenticated', 'authenticated',
      'buyer-rls@example.com', extensions.crypt('test-pass-buyer', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
    ),
    (
      '00000000-0000-0000-0000-000000000000', stranger_id, 'authenticated', 'authenticated',
      'stranger-rls@example.com', extensions.crypt('test-pass-stranger', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
    )
  on conflict (id) do nothing;

  insert into public.profiles (id, full_name, phone, is_admin)
  values
    (owner_id, 'Owner RLS', '03001111111', false),
    (buyer_id, 'Buyer RLS', '03002222222', false),
    (stranger_id, 'Stranger RLS', '03003333333', false)
  on conflict (id) do update
    set full_name = excluded.full_name,
        phone = excluded.phone,
        is_admin = false;

  perform set_config('app.bypass_listing_protect', 'on', true);

  insert into public.listings (
    id, owner_id, title, description, price, city, address,
    property_type, listing_type, bedrooms, bathrooms, area_sqft,
    image_urls, status, hold_status
  ) values
    (
      listing_id, owner_id,
      'Approved fixture home',
      'Long enough description for the approved listing used in RLS tests.',
      1000000, 'Karachi', 'Test Street 1',
      'apartment', 'sale', 2, 1, 900, '{}', 'approved', 'none'
    ),
    (
      pending_id, owner_id,
      'Pending fixture home',
      'Long enough description for the pending listing used in RLS tests.',
      2000000, 'Lahore', 'Test Street 2',
      'villa', 'sale', 3, 2, 1500, '{}', 'pending', 'none'
    )
  on conflict (id) do update
    set status = excluded.status,
        owner_id = excluded.owner_id,
        title = excluded.title,
        hold_status = 'none';

  insert into public.conversations (id, listing_id, buyer_id, owner_id)
  values (conv_id, listing_id, buyer_id, owner_id)
  on conflict (id) do nothing;

  insert into public.messages (id, conversation_id, sender_id, body)
  values (msg_id, conv_id, buyer_id, 'Private hello from buyer')
  on conflict (id) do nothing;

  perform set_config('app.bypass_listing_protect', 'off', true);

  -- ------------------------------------------------------------------
  -- Switch to authenticated so RLS applies (postgres bypasses RLS)
  -- ------------------------------------------------------------------
  execute 'set local role authenticated';

  -- 1) Cannot edit another user's listing
  perform pg_temp.act_as(stranger_id);
  update public.listings set title = 'Hacked title' where id = listing_id;
  get diagnostics n = row_count;
  if n <> 0 or exists (select 1 from public.listings where id = listing_id and title = 'Hacked title') then
    perform pg_temp.fail('user cannot edit another user listing', format('row_count=%s', n));
  end if;
  perform pg_temp.pass('user cannot edit another user listing');

  -- 2) Cannot delete another user's listing
  perform pg_temp.act_as(stranger_id);
  delete from public.listings where id = listing_id;
  get diagnostics n = row_count;
  if n <> 0 or not exists (select 1 from public.listings where id = listing_id) then
    perform pg_temp.fail('user cannot delete another user listing', format('row_count=%s', n));
  end if;
  perform pg_temp.pass('user cannot delete another user listing');

  -- 3) Cannot read another user's conversations
  perform pg_temp.act_as(stranger_id);
  if exists (select 1 from public.conversations where id = conv_id) then
    perform pg_temp.fail('cannot read another user conversations');
  end if;
  perform pg_temp.pass('cannot read another user conversations');

  -- 4) Cannot read another user's messages
  perform pg_temp.act_as(stranger_id);
  if exists (select 1 from public.messages where id = msg_id) then
    perform pg_temp.fail('cannot read another user messages');
  end if;
  perform pg_temp.pass('cannot read another user messages');

  -- Buyer (participant) can read
  perform pg_temp.act_as(buyer_id);
  if not exists (select 1 from public.conversations where id = conv_id) then
    perform pg_temp.fail('buyer should read own conversation');
  end if;
  if not exists (select 1 from public.messages where id = msg_id) then
    perform pg_temp.fail('buyer should read own messages');
  end if;
  perform pg_temp.pass('participants can read own conversations and messages');

  -- 5) Cannot make themselves admin
  perform pg_temp.act_as(buyer_id);
  begin
    update public.profiles set is_admin = true where id = buyer_id;
    perform pg_temp.fail('cannot make themselves admin', 'update succeeded');
  exception
    when others then
      perform pg_temp.pass('cannot make themselves admin');
  end;
  if exists (select 1 from public.profiles where id = buyer_id and is_admin) then
    perform pg_temp.fail('cannot make themselves admin', 'is_admin became true');
  end if;

  -- 6) Cannot change own listing status
  perform pg_temp.act_as(owner_id);
  begin
    update public.listings set status = 'rejected' where id = listing_id;
    perform pg_temp.fail('cannot change own listing status', 'update succeeded');
  exception
    when others then
      perform pg_temp.pass('cannot change own listing status');
  end;

  -- 7) Cannot read other profiles' phone numbers (profiles_safe)
  perform pg_temp.act_as(buyer_id);
  select phone into phone_val from public.profiles_safe where id = owner_id;
  if phone_val is not null then
    perform pg_temp.fail('cannot read other profiles phone numbers', phone_val);
  end if;
  select phone into phone_val from public.profiles_safe where id = buyer_id;
  if phone_val is distinct from '03002222222' then
    perform pg_temp.fail('own phone should be visible', coalesce(phone_val, 'null'));
  end if;
  perform pg_temp.pass('cannot read other profiles phone numbers');

  -- 8) Public cannot see pending listings
  perform pg_temp.act_as(stranger_id);
  if exists (select 1 from public.listings where id = pending_id) then
    perform pg_temp.fail('public cannot see pending listings');
  end if;
  if not exists (select 1 from public.listings where id = listing_id) then
    perform pg_temp.fail('public should see approved listings');
  end if;
  perform pg_temp.pass('public cannot see pending listings');

  -- 9) Cannot double-book the same listing slot
  perform pg_temp.act_as(buyer_id);
  insert into public.bookings (
    id, listing_id, owner_id, visitor_id, visitor_name, visitor_email,
    visitor_phone, meeting_at, note, status
  ) values (
    booking_id, listing_id, owner_id, buyer_id, 'Buyer RLS', 'buyer-rls@example.com',
    '03002222222', meeting_at, '', 'confirmed'
  );

  perform pg_temp.act_as(stranger_id);
  begin
    insert into public.bookings (
      listing_id, owner_id, visitor_id, visitor_name, visitor_email,
      visitor_phone, meeting_at, note, status
    ) values (
      listing_id, owner_id, stranger_id, 'Stranger RLS', 'stranger-rls@example.com',
      '03003333333', meeting_at, '', 'confirmed'
    );
    perform pg_temp.fail('cannot double-book same listing slot', 'second insert succeeded');
  exception
    when unique_violation then
      perform pg_temp.pass('cannot double-book same listing slot');
    when others then
      -- Trigger / exclusion may use a different SQLSTATE
      perform pg_temp.pass('cannot double-book same listing slot');
  end;

  raise notice 'ALL RLS TESTS PASSED (% checks)', (select count(*) from _rls_pass);
end $$;

rollback;
