# Supabase SQL run order

Run these files in the Supabase Dashboard → **SQL Editor**, top to bottom.
Do not skip `schema.sql` on a brand-new project. If the schema is already applied, you can paste only `all_migrations_in_order.sql` (or the individual migrations below it).

| # | File | Description |
| --- | --- | --- |
| 1 | `schema.sql` | Full baseline schema: tables, RLS, storage bucket, realtime, admin/booking/rate-limit helpers for new installs. |
| 2 | `migration_listing_type.sql` | Adds Buy/Rent `listing_type` on listings (sale \| rent). |
| 3 | `migration_security.sql` | Tightens CHECKs, profile RLS, `profiles_safe`, and storage folder policies. |
| 4 | `migration_admin.sql` | Listing approval (`pending`/`approved`/`rejected`), `is_admin`, and admin RLS. |
| 5 | `migration_bookings.sql` | `bookings` table, slot uniqueness, booking RLS, and booked-slots RPC. |
| 6 | `migration_message_email.sql` | Message-email cooldown table + claim function for `notify-new-message`. |
| 7 | `migration_rate_limits.sql` | DB rate limits for listings/messages/bookings + edge rate-limit buckets. |

**Shortcut:** after `schema.sql`, paste `all_migrations_in_order.sql` once (files 2–7 combined, idempotent).
