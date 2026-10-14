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
| 8 | `migration_holds.sql` | Paid holds: `holds` table, `hold_status`, fee config, booking `pending`, `expire_holds` + pg_cron. |
| 9 | `migration_app_events.sql` | `app_events` table + `log_app_event` for ops monitoring (approvals, bookings, email failures, rate limits). |
| 10 | `migration_launch_polish.sql` | Listing reports queue + `prepare_account_deletion` helper for account delete. |
| 11 | `migration_indexes.sql` | Query indexes (safe if optional tables missing). |
| 12 | `migration_messages_realtime.sql` | Add `public.messages` to `supabase_realtime` (live chat). |
| 13 | `migration_message_replies.sql` | `messages.reply_to_id` + same-conversation trigger. |

**Shortcut:** after `schema.sql`, paste `all_migrations_in_order.sql` once (files 2–7 combined, idempotent), then run `migration_holds.sql`, `migration_app_events.sql`, `migration_launch_polish.sql`, `migration_indexes.sql`, `migration_messages_realtime.sql`, and `migration_message_replies.sql`.
