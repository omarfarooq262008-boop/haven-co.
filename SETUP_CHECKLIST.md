# Pre-launch setup checklist

## Secrets to set (names only)

### Vercel (frontend env — rebuild after changing)

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SENTRY_DSN` (optional)
- `VITE_SUPABASE_IMAGE_TRANSFORM` (optional; `true` only on Pro+ with transforms on)

### Supabase Edge Function secrets (`supabase secrets set …`)

- `GMAIL_USER` (optional Gmail SMTP fallback — full address, e.g. `you@gmail.com`)
- `GMAIL_APP_PASSWORD` (16-char Google App Password; required with `GMAIL_USER`)
- `RESEND_API_KEY` (used when Gmail secrets are not set)
- `RESEND_FROM_EMAIL` (Resend from address; optional display name when using Gmail)
- `APP_URL` (public site URL, no trailing slash — used in email links and payment return URLs)
- `MESSAGE_NOTIFY_WEBHOOK_SECRET`
- `LISTING_REVIEW_WEBHOOK_SECRET`
- `PAYMENT_PROVIDER` (`mock` for testing; later `safepay` | `payfast` | `paymob`)
- `PAYMENT_WEBHOOK_SECRET` (HMAC secret for mock / real provider webhooks)

(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically to Edge Functions.)

**Email provider:** if both `GMAIL_USER` and `GMAIL_APP_PASSWORD` are set, Edge Functions send via Gmail SMTP (`smtp.gmail.com:465`). Otherwise they use Resend. Never put these values in frontend env.

---

## Dashboard steps still required

### 1. Database SQL

1. Run `supabase/schema.sql` (new project) or confirm schema already exists.
2. Run `supabase/all_migrations_in_order.sql` (or follow `supabase/RUN_ORDER.md`).
3. Run `supabase/migration_holds.sql` (paid holds — safe to re-run).
4. Run `supabase/migration_app_events.sql` (ops event log — safe to re-run).
5. Promote yourself to admin (SQL Editor):

   ```sql
   update public.profiles
   set is_admin = true
   where id = (select id from auth.users where email = 'YOUR_EMAIL@example.com');
   ```

### 2. Edge Functions

1. `supabase login` and `supabase link --project-ref YOUR_PROJECT_REF`
2. Set the Edge Function secrets listed above.
3. Deploy with `.\supabase\deploy_functions.ps1` (deploys `send-booking-email`, `notify-new-message`, `notify-listing-review`, …).

### 3. Database Webhooks

**Chat messages**

1. Dashboard → **Database → Webhooks**.
2. Name: `notify-new-message`
3. Table: `public.messages` · Events: **Insert**
4. URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-new-message`
5. Headers: `Content-Type: application/json` and `x-webhook-secret: <MESSAGE_NOTIFY_WEBHOOK_SECRET>`

**Listing review**

1. Name: `notify-listing-review`
2. Table: `public.listings` · Events: **Insert** and **Update**
3. URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/notify-listing-review`
4. Headers: `Content-Type: application/json` and `x-webhook-secret: <LISTING_REVIEW_WEBHOOK_SECRET>`

### 4. Auth URL config

1. **Authentication → URL configuration**
2. Set **Site URL** to your production frontend URL.
3. Add the same URL (and local `http://localhost:5173` if needed) under **Redirect URLs**.

### 5. Auth rate limits

1. **Authentication → Rate Limits**
2. Review email send limit, sign-up/sign-in per IP, OTP/cooldown, and token refresh.
3. Enable **IP address forwarding** if the app is behind Vercel/Cloudflare.
4. Suggested starting points are documented in the Auth rate-limits guide; keep built-in email at 2/hour unless custom SMTP is configured.

### 6. Email sending (Gmail fallback or Resend)

**Option A — Gmail SMTP (works without a verified Resend domain)**

1. Enable 2FA on the Google account, then create an [App Password](https://myaccount.google.com/apppasswords).
2. Set secrets (Edge only — not Vercel / `.env`):

   ```bash
   npx supabase secrets set GMAIL_USER=you@gmail.com
   npx supabase secrets set GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
   ```

3. Redeploy the three email functions (see below).

**Option B — Resend (preferred once a domain is verified)**

1. Create a Resend API key; store it as `RESEND_API_KEY`.
2. Verify your sending domain in Resend (DNS: SPF, DKIM, DMARC as required).
3. Set `RESEND_FROM_EMAIL` to an address on that verified domain.
4. Until the domain is verified, Resend only allows sending to your own account email — use Gmail secrets as fallback instead.

**Redeploy email functions** (no Docker; `--use-api`):

```bash
npx supabase functions deploy send-booking-email --use-api
npx supabase functions deploy notify-new-message --use-api
npx supabase functions deploy notify-listing-review --use-api
```

### 7. Paid holds (mock payment)

1. Confirm `migration_holds.sql` has been run (creates `holds`, `hold_status`, fee config, cron).
2. Change the fee anytime in SQL: `update platform_config set value = '5000' where key = 'hold_fee_pkr';`
3. Set payment secrets:

   ```bash
   npx supabase secrets set PAYMENT_PROVIDER=mock
   npx supabase secrets set PAYMENT_WEBHOOK_SECRET=choose-a-long-random-string
   npx supabase secrets set APP_URL=https://your-frontend.example
   ```

4. Deploy hold functions:

   ```bash
   npx supabase functions deploy create-hold-checkout --use-api
   npx supabase functions deploy payment-webhook --use-api
   npx supabase functions deploy cancel-hold --use-api
   ```

5. Test with mock: open a listing → **Hold this property** → fill the meeting form → **Pay and book** → on the mock checkout page choose **Pay successfully** → land on `/payment/result?status=success` → confirm hold in **My bookings**. Owner can **Cancel hold** to refund and free the listing.

### 8. Monitoring

1. Deploy health: `npx supabase functions deploy health --use-api`
2. Open `/status` on the frontend and confirm “All systems working”.
3. Follow click paths in `docs/MONITORING.md` (UptimeRobot, Sentry alerts, Vercel deploy failures, Supabase usage).

### 9. Optional

- **Sentry:** create a React project, copy the DSN into `VITE_SENTRY_DSN` (Vercel + local `.env`), redeploy.
- **Image transforms:** Supabase Pro+ → Storage → enable Image Transformations → set `VITE_SUPABASE_IMAGE_TRANSFORM=true` and redeploy.
