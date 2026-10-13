# Scaling — Haven & Co

Free-tier ceilings that will bite first, warning signs, and what to upgrade in order.

Limits change; treat numbers as **order-of-magnitude** and re-check vendor dashboards before a launch spike.

## What hits first (typical free / hobby stack)

| Resource | Approx. free ceiling | Why Haven hits it | Warning signs |
| --- | --- | --- | --- |
| **Supabase Storage** | ~1 GB | Listing photos (multiple per property) | Upload failures; dashboard Storage near 100%; 413 / policy errors |
| **Supabase DB size** | ~500 MB | Listings + messages + `app_events` + indexes | Dashboard database size warnings; slow vacuum; insert errors |
| **Supabase Auth emails** | Tight hourly/daily caps | Signup + password reset | “Email rate limit exceeded”; users never get magic links |
| **Edge Function invocations** | Low monthly quota + CPU-ms | Booking email, message notify, holds, health probes | 429 from functions; cold starts + timeouts; Resend never called |
| **Vercel bandwidth** | Hobby egress cap | Image-heavy SPA + sitemap + assets | Soft limits / warnings in Vercel; slow CDN; blocked traffic |
| **Realtime connections** | Concurrent connection caps | Open message threads | Chat disconnects; subscribe errors |
| **Postgres connections** | Small pool on free | Many SPA tabs + Edge | Intermittent `too many connections`; health flapping |

Pagination (home, my listings, bookings, admin, messages) and indexes (`migration_indexes.sql`) delay DB/API pressure but **do not** fix Storage or Auth email caps.

## Warning signs by layer

**Product**

- Home “Load more” feels slow even for one page → index missing or seq scans (run `migration_indexes.sql`).
- Message history lag → too many rows without range; check `messages_conversation_created_idx`.

**Supabase**

- Project **paused** after idle (free) → treat as outage; see RUNBOOK.
- Storage nearing quota while DB is fine → compress images harder / purge orphans / upgrade Storage first.
- Edge logs show recurring 546/timeout on notify → invocation or wall-clock limits.

**Vercel**

- Analytics/bandwidth approaching plan limit after a press hit → cache headers, image CDN, or Pro.
- Build succeeding but runtime blank → almost always env/`VITE_*` (not a scale issue).

**Email**

- Resend free monthly send cap → upgrade Resend or throttle non-critical notify.
- Auth SMTP failures while Resend works → Auth path is separate; raise Auth limits or custom SMTP.

## What to upgrade first

Recommended order when metrics (not vibes) say you are close:

1. **Supabase Storage** (or aggressive image compression + lifecycle cleanup)  
   Photos dominate size. Cheapest relief for listing growth.

2. **Supabase Pro (compute + DB size + no pause)**  
   Unpauses, larger DB, better connection pooling, PITR-style recovery. Do this before a marketing push.

3. **Resend (or paid Auth email capacity)**  
   When transactional or Auth mail is rate-limited. Prefer fixing Auth SMTP for login; Resend for product mail.

4. **Edge Function quota / region**  
   When holds + notify + health burn invocations. Reduce health poll frequency if needed; then raise plan.

5. **Vercel Pro (bandwidth + analytics)**  
   After a traffic spike, not before. SPA is static; bandwidth usually trails Storage/DB.

6. **Dedicated object backup / CDN**  
   Weekly `pg_dump` does **not** store image bytes. Add Storage backup or external CDN when photos become irreplaceable.

## Engineering levers (before paying)

- Keep list queries on `.range` / Load more (already on main surfaces).
- Apply `supabase/migration_indexes.sql`.
- Compress uploads client-side (existing listing image pipeline).
- Sample Sentry; avoid logging PII into `app_events`.
- Point UptimeRobot at health with a **5+ minute** interval to spare Edge quota.
- Cap admin/report pages; archive old `app_events`.

## Capacity checklist (monthly)

- [ ] Supabase Storage % used  
- [ ] Database size % used  
- [ ] Auth email bounce/rate-limit events  
- [ ] Edge invocation count vs plan  
- [ ] Vercel bandwidth  
- [ ] Latest backup artifact size/date (Actions → Weekly database backup)  
- [ ] `/status` and health still green  

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [RUNBOOK.md](./RUNBOOK.md)
- [MONITORING.md](./MONITORING.md)
