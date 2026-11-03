-- =============================================================================
-- Haven & Co — DEMO RESET + SEED (portfolio sample data)
-- =============================================================================
-- Run manually: Supabase Dashboard → SQL Editor → paste this file → Run.
-- Wrapped in ONE transaction. Safe to re-run (fixed UUIDs + upserts).
--
-- DELETES (user / test data only — not schema, policies, or functions):
--   public.messages, public.conversations, public.message_email_cooldowns,
--   public.holds (if present), public.bookings, public.listing_reports (if present),
--   public.webhook_events (if present), public.app_events (if present),
--   public.email_outbox (if present), public.edge_rate_buckets (bucket counters),
--   public.listings,
--   auth.users EXCEPT: profiles with is_admin = true, and the 3 demo emails below.
--
-- KEEPS:
--   Table structure, RLS policies, functions, triggers (re-enabled at end),
--   public.platform_config (hold fee etc.), any other config tables,
--   your admin account (is_admin = true), demo users (created/updated here).
--
-- DEMO USERS (password for all three: DemoPass123!)
--   demo.owner1@example.com  → Ayesha Khan   0300-1111101
--   demo.owner2@example.com  → Bilal Ahmed   0300-2222202
--   demo.buyer@example.com   → Sara Malik    0300-3333303
--
-- IMAGES: frontend/public/demo/listing-01.webp … listing-42.webp (SPA static).
--   v_site_origin is set to the live Vercel URL below. Match VITE_SITE_URL.
--
-- STORAGE: Do NOT empty listing-images here. In Dashboard → Storage →
--   listing-images → select all → Delete (or empty bucket). Seed uses /demo/ URLs.
--
-- SIDE EFFECTS: rate-limit + booking-validate triggers are disabled during seed;
--   app.bypass_listing_protect is on so listings insert as approved without review
--   emails. Supabase Dashboard "Database Webhooks" are NOT Postgres triggers —
--   if review/message emails still fire, pause those webhooks in the Dashboard
--   for this run, then turn them back on.
-- =============================================================================

begin;

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 0) List triggers on seed-touched tables (NOTICE output in SQL Editor)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  raise notice '=== Triggers on listings / messages / bookings / conversations ===';
  for r in
    select c.relname as table_name, t.tgname as trigger_name,
           p.proname as function_name, t.tgenabled as enabled
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'public'
      and c.relname in ('listings', 'messages', 'bookings', 'conversations', 'holds')
      and not t.tgisinternal
    order by c.relname, t.tgname
  loop
    raise notice '  %.% → % (enabled=%)', r.table_name, r.trigger_name, r.function_name, r.enabled;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 1) Disable side-effect / seed-blocking triggers (re-enabled at end)
--    Only if the trigger exists (names from schema.sql / migration_rate_limits /
--    migration_bookings / migration_holds).
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.relname, t.tgname
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and not t.tgisinternal
      and (
        (c.relname = 'listings' and t.tgname = 'enforce_listing_rate_limit_trg')
        or (c.relname = 'messages' and t.tgname = 'enforce_message_rate_limit_trg')
        or (c.relname = 'bookings' and t.tgname in (
          'enforce_booking_rate_limit_trg', 'validate_booking_row_trg'
        ))
      )
  loop
    execute format('alter table public.%I disable trigger %I', r.relname, r.tgname);
    raise notice 'Disabled %.%', r.relname, r.tgname;
  end loop;

  -- Optional: webhook-like triggers (Dashboard DB webhooks may use these)
  for r in
    select c.relname, t.tgname, p.proname
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'public'
      and c.relname in ('listings', 'messages')
      and not t.tgisinternal
      and (
        p.proname ilike '%http%'
        or p.proname ilike '%webhook%'
        or p.proname ilike '%net_%'
        or t.tgname ilike '%webhook%'
      )
  loop
    execute format('alter table public.%I disable trigger %I', r.relname, r.tgname);
    raise notice 'Disabled webhook-like trigger %.%', r.relname, r.tgname;
  end loop;
end $$;

-- =============================================================================
-- Variables + fixed UUIDs
-- =============================================================================
do $$
declare
  v_site_origin text := 'https://haven-co-zeta.vercel.app';

  v_owner1_fixed uuid := 'b1000001-0000-4000-8000-000000000001';
  v_owner2_fixed uuid := 'b1000001-0000-4000-8000-000000000002';
  v_buyer_fixed  uuid := 'b1000001-0000-4000-8000-000000000003';
  v_owner1 uuid;
  v_owner2 uuid;
  v_buyer  uuid;
  v_admin  uuid;

  v_fee integer := 5000;
  v_pass text := extensions.crypt('DemoPass123!', extensions.gen_salt('bf'));
  v_instance uuid := '00000000-0000-0000-0000-000000000000';

  -- listings L01–L14 approved, L15 pending
  L01 uuid := 'b2000001-0000-4000-8000-000000000001';
  L02 uuid := 'b2000001-0000-4000-8000-000000000002';
  L03 uuid := 'b2000001-0000-4000-8000-000000000003';
  L04 uuid := 'b2000001-0000-4000-8000-000000000004';
  L05 uuid := 'b2000001-0000-4000-8000-000000000005';
  L06 uuid := 'b2000001-0000-4000-8000-000000000006';
  L07 uuid := 'b2000001-0000-4000-8000-000000000007';
  L08 uuid := 'b2000001-0000-4000-8000-000000000008';
  L09 uuid := 'b2000001-0000-4000-8000-000000000009';
  L10 uuid := 'b2000001-0000-4000-8000-00000000000a';
  L11 uuid := 'b2000001-0000-4000-8000-00000000000b';
  L12 uuid := 'b2000001-0000-4000-8000-00000000000c';
  L13 uuid := 'b2000001-0000-4000-8000-00000000000d';
  L14 uuid := 'b2000001-0000-4000-8000-00000000000e';
  L15 uuid := 'b2000001-0000-4000-8000-00000000000f'; -- pending

  C01 uuid := 'b3000001-0000-4000-8000-000000000001';
  C02 uuid := 'b3000001-0000-4000-8000-000000000002';
  C03 uuid := 'b3000001-0000-4000-8000-000000000003';
  C04 uuid := 'b3000001-0000-4000-8000-000000000004';

  B01 uuid := 'b4000001-0000-4000-8000-000000000001'; -- upcoming
  B02 uuid := 'b4000001-0000-4000-8000-000000000002'; -- past
  B03 uuid := 'b4000001-0000-4000-8000-000000000003'; -- cancelled
  B04 uuid := 'b4000001-0000-4000-8000-000000000004'; -- hold booking

  H01 uuid := 'b5000001-0000-4000-8000-000000000001';
  R01 uuid := 'b6000001-0000-4000-8000-000000000001';
  R02 uuid := 'b6000001-0000-4000-8000-000000000002';
begin
  perform set_config('app.bypass_listing_protect', 'on', true);

  -- Hold fee from config when present
  if to_regclass('public.platform_config') is not null then
    select greatest(1, coalesce(nullif(trim(value), '')::integer, 5000))
      into v_fee
    from public.platform_config
    where key = 'hold_fee_pkr';
    if v_fee is null then v_fee := 5000; end if;
  end if;

  select p.id into v_admin
  from public.profiles p
  where p.is_admin = true
  order by p.created_at
  limit 1;

  if v_admin is null then
    raise exception 'No admin profile found (is_admin = true). Promote your account first, then re-run.';
  end if;

  -- Prefer existing demo accounts by email; otherwise use fixed UUIDs
  select id into v_owner1 from auth.users where lower(email) = 'demo.owner1@example.com';
  select id into v_owner2 from auth.users where lower(email) = 'demo.owner2@example.com';
  select id into v_buyer  from auth.users where lower(email) = 'demo.buyer@example.com';
  v_owner1 := coalesce(v_owner1, v_owner1_fixed);
  v_owner2 := coalesce(v_owner2, v_owner2_fixed);
  v_buyer  := coalesce(v_buyer,  v_buyer_fixed);

  raise notice 'Admin kept: %', v_admin;
  raise notice 'Demo owners/buyer: % / % / %', v_owner1, v_owner2, v_buyer;
  raise notice 'Site origin for image_urls: %', v_site_origin;
  raise notice 'Hold fee PKR: %', v_fee;

  -- -------------------------------------------------------------------------
  -- 2) RESET (optional tables only via to_regclass + EXECUTE)
  -- -------------------------------------------------------------------------
  delete from public.messages;
  if to_regclass('public.message_email_cooldowns') is not null then
    execute 'delete from public.message_email_cooldowns';
  end if;
  delete from public.conversations;
  if to_regclass('public.holds') is not null then
    execute 'delete from public.holds';
  end if;
  delete from public.bookings;
  if to_regclass('public.listing_reports') is not null then
    execute 'delete from public.listing_reports';
  end if;
  if to_regclass('public.webhook_events') is not null then
    execute 'delete from public.webhook_events';
  end if;
  if to_regclass('public.app_events') is not null then
    execute 'delete from public.app_events';
  end if;
  if to_regclass('public.email_outbox') is not null then
    execute 'delete from public.email_outbox';
  end if;
  if to_regclass('public.edge_rate_buckets') is not null then
    execute 'delete from public.edge_rate_buckets';
  end if;
  delete from public.listings;

  -- Remove junk auth users; keep admin + demo trio
  delete from auth.users u
  where u.id is distinct from v_admin
    and u.id not in (v_owner1, v_owner2, v_buyer);

  -- -------------------------------------------------------------------------
  -- 3) Ensure demo auth users + identities for email login
  -- -------------------------------------------------------------------------
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  values
    (v_instance, v_owner1, 'authenticated', 'authenticated',
     'demo.owner1@example.com', v_pass, now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Ayesha Khan"}'::jsonb, now() - interval '40 days', now()),
    (v_instance, v_owner2, 'authenticated', 'authenticated',
     'demo.owner2@example.com', v_pass, now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Bilal Ahmed"}'::jsonb, now() - interval '35 days', now()),
    (v_instance, v_buyer, 'authenticated', 'authenticated',
     'demo.buyer@example.com', v_pass, now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Sara Malik"}'::jsonb, now() - interval '30 days', now())
  on conflict (id) do update
    set email = excluded.email,
        encrypted_password = excluded.encrypted_password,
        email_confirmed_at = coalesce(auth.users.email_confirmed_at, excluded.email_confirmed_at),
        raw_user_meta_data = excluded.raw_user_meta_data,
        updated_at = now();

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  )
  values
    (v_owner1, v_owner1,
     jsonb_build_object('sub', v_owner1::text, 'email', 'demo.owner1@example.com', 'email_verified', true),
     'email', v_owner1::text, now(), now(), now()),
    (v_owner2, v_owner2,
     jsonb_build_object('sub', v_owner2::text, 'email', 'demo.owner2@example.com', 'email_verified', true),
     'email', v_owner2::text, now(), now(), now()),
    (v_buyer, v_buyer,
     jsonb_build_object('sub', v_buyer::text, 'email', 'demo.buyer@example.com', 'email_verified', true),
     'email', v_buyer::text, now(), now(), now())
  on conflict (provider, provider_id) do update
    set user_id = excluded.user_id,
        identity_data = excluded.identity_data,
        updated_at = now();

  insert into public.profiles (id, full_name, phone, is_admin, created_at)
  values
    (v_owner1, 'Ayesha Khan', '0300-1111101', false, now() - interval '40 days'),
    (v_owner2, 'Bilal Ahmed', '0300-2222202', false, now() - interval '35 days'),
    (v_buyer,  'Sara Malik',  '0300-3333303', false, now() - interval '30 days')
  on conflict (id) do update
    set full_name = excluded.full_name,
        phone = excluded.phone,
        is_admin = false;

  -- -------------------------------------------------------------------------
  -- 4) Listings (14 approved + 1 pending). Types: apartment|villa|townhouse|commercial|other
  --    "New" look: L12–L14 created in the last 3 days (no featured column in schema).
  -- -------------------------------------------------------------------------
  insert into public.listings (
    id, owner_id, title, description, price, city, address,
    property_type, listing_type, bedrooms, bathrooms, area_sqft,
    image_urls, status, hold_status, created_at
  ) values
  (
    L01, v_owner1,
    'Bright 2-bed apartment in DHA Phase 6',
    'Sunlit corner apartment on a quiet DHA Phase 6 lane with open lounge, fitted kitchen, and two balconies overlooking greenery. Ideal for a small family relocating to Karachi. Building has backup generator, covered parking, and 24/7 security. Walking distance to commercial lane and parks. Immediate possession, well maintained by current owner.',
    28500000, 'Karachi', 'Street 12, DHA Phase 6',
    'apartment', 'sale', 2, 2, 1250,
    array[v_site_origin || '/demo/listing-01.webp', v_site_origin || '/demo/listing-02.webp', v_site_origin || '/demo/listing-03.webp'],
    'approved', 'none', now() - interval '28 days'
  ),
  (
    L02, v_owner1,
    'Sea-view flat near Clifton Block 4',
    'Third-floor flat with partial sea view, marble flooring, and a renovated kitchen. Two bedrooms with attached baths, dedicated servant wash, and reserved parking. Close to Do Darya restaurants and Beach Avenue. Perfect for professionals who want Clifton convenience without a tower lifestyle. Documents clear and ready for transfer.',
    42000000, 'Karachi', 'Block 4, Clifton',
    'apartment', 'sale', 2, 2, 1450,
    array[v_site_origin || '/demo/listing-04.webp', v_site_origin || '/demo/listing-05.webp', v_site_origin || '/demo/listing-06.webp', v_site_origin || '/demo/listing-07.webp'],
    'approved', 'none', now() - interval '25 days'
  ),
  (
    L03, v_owner2,
    'Spacious villa in Bahria Town Karachi',
    'Corner villa with landscaped lawn, double-height lounge, and four bedrooms including a ground-floor guest suite. Modern kitchen with island, rooftop terrace, and solar-ready wiring. Gated community amenities: parks, mosque, and schools nearby. Built for a growing family who wants space and security in Bahria Town Karachi.',
    67500000, 'Karachi', 'Precinct 10-A, Bahria Town',
    'villa', 'sale', 4, 5, 3200,
    array[v_site_origin || '/demo/listing-08.webp', v_site_origin || '/demo/listing-09.webp', v_site_origin || '/demo/listing-10.webp', v_site_origin || '/demo/listing-11.webp'],
    'approved', 'none', now() - interval '22 days'
  ),
  (
    L04, v_owner2,
    'Gulberg III townhouse with private garage',
    'Three-storey townhouse on a calm Gulberg III street: formal drawing, family lounge, and four bedrooms. Private garage for two cars, rooftop sitting area, and gas geyser. Walking distance to MM Alam Road cafes. Recently painted interiors with new kitchen cabinets. Suitable for owners who want Lahore central living with parking.',
    89000000, 'Lahore', 'Street 7, Gulberg III',
    'townhouse', 'sale', 4, 4, 2800,
    array[v_site_origin || '/demo/listing-12.webp', v_site_origin || '/demo/listing-13.webp', v_site_origin || '/demo/listing-14.webp'],
    'approved', 'none', now() - interval '20 days'
  ),
  (
    L05, v_owner1,
    'Modern office floor near Blue Area',
    'Open-plan commercial floor with glass partition offices, reception, pantry, and two washrooms. Lift access, backup power, and fibre-ready risers. Ideal for a consultancy or tech team of 15–25. Facing a main Blue Area artery with street parking and nearby banks. Lease terms flexible for serious tenants.',
    450000, 'Islamabad', 'Jinnah Avenue, Blue Area',
    'commercial', 'rent', 0, 2, 2200,
    array[v_site_origin || '/demo/listing-15.webp', v_site_origin || '/demo/listing-16.webp', v_site_origin || '/demo/listing-17.webp'],
    'approved', 'none', now() - interval '18 days'
  ),
  (
    L06, v_owner1,
    'F-7 apartment steps from the Markaz',
    'Well-kept two-bed apartment in F-7 with lift, covered parking, and a quiet rear balcony. Open kitchen, storage loft, and separate laundry. Five minutes walk to F-7 Markaz shops and restaurants. Excellent for diplomats or couples who want Islamabad’s most walkable sector. Available furnished on request.',
    185000, 'Islamabad', 'Street 42, F-7/2',
    'apartment', 'rent', 2, 2, 1100,
    array[v_site_origin || '/demo/listing-18.webp', v_site_origin || '/demo/listing-19.webp', v_site_origin || '/demo/listing-20.webp', v_site_origin || '/demo/listing-21.webp'],
    'approved', 'none', now() - interval '16 days'
  ),
  (
    L07, v_owner2,
    'DHA Lahore Phase 5 family home',
    'Single-unit house on a 10-marla plot with lawn, car porch, and four bedrooms. Drawing and dining on ground floor, TV lounge upstairs, and servant quarter. Near commercial broadway and parks. Solid construction with recent plumbing upgrades. A straightforward family purchase in DHA Phase 5 with clear title.',
    95000000, 'Lahore', 'Sector Y, DHA Phase 5',
    'villa', 'sale', 4, 4, 3500,
    array[v_site_origin || '/demo/listing-22.webp', v_site_origin || '/demo/listing-23.webp', v_site_origin || '/demo/listing-24.webp', v_site_origin || '/demo/listing-25.webp', v_site_origin || '/demo/listing-26.webp'],
    'approved', 'none', now() - interval '14 days'
  ),
  (
    L08, v_owner2,
    'Clifton studio loft for young professionals',
    'Compact studio loft with mezzanine sleeping deck, galley kitchen, and full bath. High ceilings, large window, and building generator. Surrounded by cafes on Khayaban-e-Saadi. Ideal solo rental for someone working in Clifton or DHA. Soft furnishings negotiable; available from next month.',
    95000, 'Karachi', 'Khayaban-e-Saadi, Clifton',
    'apartment', 'rent', 1, 1, 520,
    array[v_site_origin || '/demo/listing-27.webp', v_site_origin || '/demo/listing-28.webp'],
    'approved', 'none', now() - interval '12 days'
  ),
  (
    L09, v_owner1,
    'Bahria Enclave plot with park frontage',
    'Residential plot facing a community park in Bahria Enclave, Islamabad. Levelled ground, corner access road, and clear demarcation. Suitable for a custom villa build. Community has schools, mosques, and controlled entry. Documents verified for transfer. Priced for buyers ready to start construction within the year.',
    18500000, 'Islamabad', 'Block C, Bahria Enclave',
    'other', 'sale', 0, 0, 4500,
    array[v_site_origin || '/demo/listing-29.webp', v_site_origin || '/demo/listing-30.webp', v_site_origin || '/demo/listing-31.webp'],
    'approved', 'none', now() - interval '10 days'
  ),
  (
    L10, v_owner1,
    'Gulberg rental townhouse near MM Alam',
    'Furnished three-bed townhouse for rent with generator, UPS, and deep freezer included. Formal lounge, kitchen with appliances, and rooftop BBQ area. Two-car garage. Quiet street yet five minutes to MM Alam Road. Prefer a family or senior professionals; one-year lease with two months security.',
    275000, 'Lahore', 'Street 19, Gulberg II',
    'townhouse', 'rent', 3, 3, 2100,
    array[v_site_origin || '/demo/listing-32.webp', v_site_origin || '/demo/listing-33.webp', v_site_origin || '/demo/listing-34.webp', v_site_origin || '/demo/listing-35.webp'],
    'approved', 'none', now() - interval '8 days'
  ),
  (
    L11, v_owner2,
    'DHA Karachi Phase 8 penthouse',
    'Top-floor penthouse with private terrace, three bedrooms, and panoramic evening views. Italian kitchen, smart lighting, and two reserved parking slots. Building amenities include gym and rooftop lounge. Designed for buyers who want lock-and-leave luxury in Phase 8. Viewing by appointment only.',
    125000000, 'Karachi', 'DHA Phase 8',
    'apartment', 'sale', 3, 4, 2950,
    array[v_site_origin || '/demo/listing-36.webp', v_site_origin || '/demo/listing-37.webp', v_site_origin || '/demo/listing-38.webp', v_site_origin || '/demo/listing-39.webp'],
    'approved', 'none', now() - interval '6 days'
  ),
  (
    L12, v_owner2,
    'New listing: F-10 duplex with garden',
    'Just listed duplex in F-10 with private front garden, four bedrooms, and a bright kitchen opening to a deck. Fresh paint, new AC units, and fibre already installed. Near schools and F-10 Markaz. Soft launch price for serious buyers — expect interest this week. Schedule a morning viewing for the best light.',
    78000000, 'Islamabad', 'Street 9, F-10/3',
    'villa', 'sale', 4, 4, 3100,
    array[v_site_origin || '/demo/listing-40.webp', v_site_origin || '/demo/listing-41.webp', v_site_origin || '/demo/listing-42.webp', v_site_origin || '/demo/listing-01.webp'],
    'approved', 'none', now() - interval '2 days'
  ),
  (
    L13, v_owner1,
    'New listing: DHA Lahore Phase 6 rental villa',
    'Fresh to market: four-bed rental villa with lawn, servant room, and generator. Spacious lounge and dining, kids’ play corner upstairs. Quiet cul-de-sac in Phase 6. Prefer diplomatic or corporate tenants. Available immediately after a short touch-up. Book a slot this weekend before viewings fill up.',
    320000, 'Lahore', 'Sector AA, DHA Phase 6',
    'villa', 'rent', 4, 5, 3600,
    array[v_site_origin || '/demo/listing-02.webp', v_site_origin || '/demo/listing-08.webp', v_site_origin || '/demo/listing-22.webp'],
    'approved', 'none', now() - interval '1 day'
  ),
  (
    L14, v_owner1,
    'New listing: shop-front commercial in Clifton',
    'Ground-floor commercial unit with glass frontage on a busy Clifton road. Suitable for boutique, clinic, or café fit-out. Rear storage, washroom, and meter already installed. High footfall evenings and weekends. New to Haven & Co — early inquiries welcome from brand-ready tenants.',
    550000, 'Karachi', 'Shahrah-e-Iran, Clifton',
    'commercial', 'rent', 0, 1, 980,
    array[v_site_origin || '/demo/listing-15.webp', v_site_origin || '/demo/listing-16.webp', v_site_origin || '/demo/listing-17.webp', v_site_origin || '/demo/listing-29.webp'],
    'approved', 'none', now() - interval '8 hours'
  ),
  (
    L15, v_owner2,
    'Pending review: Model Town annex for rent',
    'Owner-submitted annex behind a Model Town house: two bedrooms, kitchenette, and private entrance. Quiet courtyard, separate utility meters, and parking for one car. Waiting for admin approval before it goes live on Haven & Co. Useful sample for the review queue — not yet visible to buyers.',
    120000, 'Lahore', 'Block L, Model Town',
    'apartment', 'rent', 2, 1, 850,
    array[v_site_origin || '/demo/listing-18.webp', v_site_origin || '/demo/listing-19.webp'],
    'pending', 'none', now() - interval '5 hours'
  );

  -- -------------------------------------------------------------------------
  -- 5) Conversations + messages (buyer ↔ owners), with replies
  -- -------------------------------------------------------------------------
  insert into public.conversations (id, listing_id, buyer_id, owner_id, created_at) values
    (C01, L01, v_buyer, v_owner1, now() - interval '6 days'),
    (C02, L04, v_buyer, v_owner2, now() - interval '5 days'),
    (C03, L06, v_buyer, v_owner1, now() - interval '3 days'),
    (C04, L11, v_buyer, v_owner2, now() - interval '2 days');

  -- C01 messages
  insert into public.messages (id, conversation_id, sender_id, body, reply_to_id, created_at) values
    ('b3100001-0000-4000-8000-000000000001', C01, v_buyer,
     'Hi Ayesha — is the DHA Phase 6 apartment still available for viewing this week?', null,
     now() - interval '6 days' + interval '1 hour'),
    ('b3100001-0000-4000-8000-000000000002', C01, v_owner1,
     'Yes Sara, it is. Saturday morning or Sunday afternoon both work. Which do you prefer?',
     'b3100001-0000-4000-8000-000000000001',
     now() - interval '6 days' + interval '2 hours'),
    ('b3100001-0000-4000-8000-000000000003', C01, v_buyer,
     'Saturday at 11 works. Is covered parking included in the asking price?',
     'b3100001-0000-4000-8000-000000000002',
     now() - interval '5 days' + interval '10 hours'),
    ('b3100001-0000-4000-8000-000000000004', C01, v_owner1,
     'Parking is included. I will meet you at the gate with the caretaker.',
     'b3100001-0000-4000-8000-000000000003',
     now() - interval '5 days' + interval '12 hours'),
    ('b3100001-0000-4000-8000-000000000005', C01, v_buyer,
     'Perfect — see you Saturday. I may bring my partner as well.',
     'b3100001-0000-4000-8000-000000000004',
     now() - interval '4 days');

  -- C02
  insert into public.messages (id, conversation_id, sender_id, body, reply_to_id, created_at) values
    ('b3100001-0000-4000-8000-000000000011', C02, v_buyer,
     'Bilal, does the Gulberg townhouse allow a small home office on the top floor?', null,
     now() - interval '5 days' + interval '3 hours'),
    ('b3100001-0000-4000-8000-000000000012', C02, v_owner2,
     'Absolutely — the top floor lounge is often used as a study. Happy to show you.',
     'b3100001-0000-4000-8000-000000000011',
     now() - interval '5 days' + interval '5 hours'),
    ('b3100001-0000-4000-8000-000000000013', C02, v_buyer,
     'Great. What is the earliest transfer timeline if we proceed?',
     'b3100001-0000-4000-8000-000000000012',
     now() - interval '4 days' + interval '2 hours'),
    ('b3100001-0000-4000-8000-000000000014', C02, v_owner2,
     'Documents are ready; typical transfer is 3–4 weeks after token.',
     'b3100001-0000-4000-8000-000000000013',
     now() - interval '4 days' + interval '4 hours'),
    ('b3100001-0000-4000-8000-000000000015', C02, v_buyer,
     'Thanks — I will book a viewing through the site.',
     'b3100001-0000-4000-8000-000000000014',
     now() - interval '3 days' + interval '1 hour'),
    ('b3100001-0000-4000-8000-000000000016', C02, v_owner2,
     'Sounds good. Message me if the slot you want is taken.',
     'b3100001-0000-4000-8000-000000000015',
     now() - interval '3 days' + interval '3 hours');

  -- C03
  insert into public.messages (id, conversation_id, sender_id, body, reply_to_id, created_at) values
    ('b3100001-0000-4000-8000-000000000021', C03, v_buyer,
     'Is the F-7 apartment available furnished, and are pets allowed?', null,
     now() - interval '3 days' + interval '2 hours'),
    ('b3100001-0000-4000-8000-000000000022', C03, v_owner1,
     'We can furnish on request. Small pets OK with a refundable deposit.',
     'b3100001-0000-4000-8000-000000000021',
     now() - interval '3 days' + interval '4 hours'),
    ('b3100001-0000-4000-8000-000000000023', C03, v_buyer,
     'That works. Can we do a weekday evening viewing?',
     'b3100001-0000-4000-8000-000000000022',
     now() - interval '2 days' + interval '1 hour'),
    ('b3100001-0000-4000-8000-000000000024', C03, v_owner1,
     'Wednesday 6 pm is free. I will confirm once you book the slot.',
     'b3100001-0000-4000-8000-000000000023',
     now() - interval '2 days' + interval '2 hours'),
    ('b3100001-0000-4000-8000-000000000025', C03, v_buyer,
     'Booked — looking forward to it.',
     'b3100001-0000-4000-8000-000000000024',
     now() - interval '1 day' + interval '6 hours'),
    ('b3100001-0000-4000-8000-000000000026', C03, v_owner1,
     'See you then. Entrance is from Street 42.',
     'b3100001-0000-4000-8000-000000000025',
     now() - interval '1 day' + interval '8 hours'),
    ('b3100001-0000-4000-8000-000000000027', C03, v_buyer,
     'Noted, thanks!',
     'b3100001-0000-4000-8000-000000000026',
     now() - interval '20 hours');

  -- C04
  insert into public.messages (id, conversation_id, sender_id, body, reply_to_id, created_at) values
    ('b3100001-0000-4000-8000-000000000031', C04, v_buyer,
     'The Phase 8 penthouse looks stunning. Is the terrace exclusive?', null,
     now() - interval '2 days' + interval '1 hour'),
    ('b3100001-0000-4000-8000-000000000032', C04, v_owner2,
     'Yes — private terrace for this unit only, with outdoor power points.',
     'b3100001-0000-4000-8000-000000000031',
     now() - interval '2 days' + interval '3 hours'),
    ('b3100001-0000-4000-8000-000000000033', C04, v_buyer,
     'Could we hold a viewing after Maghrib tomorrow?',
     'b3100001-0000-4000-8000-000000000032',
     now() - interval '1 day' + interval '2 hours'),
    ('b3100001-0000-4000-8000-000000000034', C04, v_owner2,
     'Tomorrow evening is tight. Morning day-after is better for light.',
     'b3100001-0000-4000-8000-000000000033',
     now() - interval '1 day' + interval '4 hours'),
    ('b3100001-0000-4000-8000-000000000035', C04, v_buyer,
     'Morning works. I may place a hold after seeing it in person.',
     'b3100001-0000-4000-8000-000000000034',
     now() - interval '12 hours'),
    ('b3100001-0000-4000-8000-000000000036', C04, v_owner2,
     'Happy to walk you through. See you then.',
     'b3100001-0000-4000-8000-000000000035',
     now() - interval '10 hours'),
    ('b3100001-0000-4000-8000-000000000037', C04, v_buyer,
     'One more thing — are maintenance dues paid up?',
     'b3100001-0000-4000-8000-000000000036',
     now() - interval '8 hours'),
    ('b3100001-0000-4000-8000-000000000038', C04, v_owner2,
     'Yes, cleared through this quarter. Receipts available at viewing.',
     'b3100001-0000-4000-8000-000000000037',
     now() - interval '6 hours');

  -- -------------------------------------------------------------------------
  -- 6) Bookings: upcoming, past, cancelled (+ separate hold booking)
  -- -------------------------------------------------------------------------
  insert into public.bookings (
    id, listing_id, owner_id, visitor_id, visitor_name, visitor_email, visitor_phone,
    meeting_at, note, status, created_at
  ) values
  (
    B01, L01, v_owner1, v_buyer, 'Sara Malik', 'demo.buyer@example.com', '0300-3333303',
    date_trunc('day', now() + interval '5 days') + interval '11 hours',
    'Saturday viewing as discussed in chat.',
    'confirmed', now() - interval '4 days'
  ),
  (
    B02, L06, v_owner1, v_buyer, 'Sara Malik', 'demo.buyer@example.com', '0300-3333303',
    now() - interval '9 days',
    'Past viewing — already completed.',
    'confirmed', now() - interval '12 days'
  ),
  (
    B03, L04, v_owner2, v_buyer, 'Sara Malik', 'demo.buyer@example.com', '0300-3333303',
    date_trunc('day', now() + interval '8 days') + interval '16 hours',
    'Cancelled by visitor after schedule conflict.',
    'cancelled', now() - interval '3 days'
  ),
  (
    B04, L11, v_owner2, v_buyer, 'Sara Malik', 'demo.buyer@example.com', '0300-3333303',
    date_trunc('day', now() + interval '2 days') + interval '10 hours',
    'Hold viewing — payment captured via mock checkout.',
    'confirmed', now() - interval '1 day'
  );

  -- -------------------------------------------------------------------------
  -- 7) Active hold (optional table — EXECUTE only)
  -- -------------------------------------------------------------------------
  if to_regclass('public.holds') is not null then
    execute format(
      $sql$
        insert into public.holds (
          id, listing_id, booking_id, visitor_id, amount, currency, status,
          provider, provider_reference, expires_at, paid_at, created_at
        ) values (
          %L::uuid, %L::uuid, %L::uuid, %L::uuid, %s, 'PKR', 'active',
          'mock', 'mock_demo_hold_ref_001',
          least(now() + interval '48 hours', date_trunc('day', now() + interval '2 days') + interval '10 hours'),
          now() - interval '20 hours',
          now() - interval '1 day'
        )
      $sql$,
      H01, L11, B04, v_buyer, v_fee
    );
    -- hold_status column from migration_holds / hold_compat
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'listings' and column_name = 'hold_status'
    ) then
      execute format('update public.listings set hold_status = %L where id = %L::uuid', 'on_hold', L11);
    end if;
  end if;

  -- -------------------------------------------------------------------------
  -- 8) Listing reports (optional — EXECUTE only)
  -- -------------------------------------------------------------------------
  if to_regclass('public.listing_reports') is not null then
    execute format(
      $sql$
        insert into public.listing_reports (
          id, listing_id, reporter_id, reason, status, admin_note, created_at
        ) values
        (
          %L::uuid, %L::uuid, %L::uuid,
          'Photos may be outdated — kitchen looks different from a recent visit nearby.',
          'open', '', now() - interval '2 days'
        ),
        (
          %L::uuid, %L::uuid, %L::uuid,
          'Asking price seems far above recent Bahria Town comps; please verify.',
          'open', '', now() - interval '1 day'
        )
      $sql$,
      R01, L08, v_buyer, R02, L03, v_buyer
    );
  end if;

  raise notice 'Demo seed complete.';
end $$;

-- ---------------------------------------------------------------------------
-- Re-enable triggers (only if present)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.relname, t.tgname
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and not t.tgisinternal
      and (
        (c.relname = 'listings' and t.tgname = 'enforce_listing_rate_limit_trg')
        or (c.relname = 'messages' and t.tgname = 'enforce_message_rate_limit_trg')
        or (c.relname = 'bookings' and t.tgname in (
          'enforce_booking_rate_limit_trg', 'validate_booking_row_trg'
        ))
      )
  loop
    execute format('alter table public.%I enable trigger %I', r.relname, r.tgname);
    raise notice 'Re-enabled %.%', r.relname, r.tgname;
  end loop;

  for r in
    select c.relname, t.tgname, p.proname
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where n.nspname = 'public'
      and c.relname in ('listings', 'messages')
      and not t.tgisinternal
      and (
        p.proname ilike '%http%'
        or p.proname ilike '%webhook%'
        or p.proname ilike '%net_%'
        or t.tgname ilike '%webhook%'
      )
  loop
    execute format('alter table public.%I enable trigger %I', r.relname, r.tgname);
    raise notice 'Re-enabled webhook-like trigger %.%', r.relname, r.tgname;
  end loop;
end $$;

commit;
