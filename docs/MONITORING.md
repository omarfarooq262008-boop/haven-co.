# Monitoring & operational readiness

Run `supabase/migration_app_events.sql`, deploy the `health` Edge Function, and set `VITE_SENTRY_DSN` before relying on these dashboards.

Health endpoint (no secrets in the body):

`GET https://YOUR_PROJECT_REF.supabase.co/functions/v1/health`  
Headers: `apikey: <anon key>` and `Authorization: Bearer <anon key>`

Frontend status page: `https://YOUR_SITE/status`

Deploy health:

```bash
npx supabase functions deploy health --use-api
```

---

## 1. UptimeRobot — site, /status, health function

### Click path

1. Open [https://uptimerobot.com](https://uptimerobot.com) → **Log in**
2. Left sidebar → **Monitoring** → **+ Add New Monitor**

### Monitors to create

| # | Monitor type | URL / config | Alert when |
| --- | --- | --- | --- |
| A | **HTTP(s)** | `https://YOUR_PRODUCTION_DOMAIN/` | Down / status ≠ 2xx |
| B | **HTTP(s)** | `https://YOUR_PRODUCTION_DOMAIN/status` | Down / status ≠ 2xx *(page itself must load; it may still show “Problem detected” if the API is down — pair with C)* |
| C | **HTTP(s)** | `https://YOUR_PROJECT_REF.supabase.co/functions/v1/health` | Status ≠ **200**, or body `status` ≠ `ok` |

For monitor **C**:

1. **Add New Monitor** → Monitor Type: **HTTP(s)**
2. Friendly name: `Haven health`
3. URL: the `…/functions/v1/health` URL above
4. Monitoring interval: **5 minutes**
5. Open **Advanced Settings** (or **HTTP method / headers**):
   - Method: **GET**
   - Custom HTTP headers:
     - `apikey: YOUR_SUPABASE_ANON_KEY`
     - `Authorization: Bearer YOUR_SUPABASE_ANON_KEY`
6. Under **Keyword / expected status** (wording varies by plan): expect HTTP **200**, or keyword `"status":"ok"`
7. **Create Monitor**
8. **My Settings** → **Alert contacts** → add email/Slack → attach contacts to each monitor

Use the **anon / publishable** key only (never the service role) in UptimeRobot.

---

## 2. Sentry — new error, spike, failed email

App already sends errors + **10% performance traces**, with PII scrubbing and release `haven-co@<VERCEL_GIT_COMMIT_SHA>`.

### Click path — project alerts

1. Open [https://sentry.io](https://sentry.io) → select the **Haven & Co** React project  
2. Left nav → **Alerts** → **Create Alert** (or **Alert Rules**)

### Rules to add

**A. New issue (first seen)**

1. **Create Alert** → **Issues**
2. Condition: **A new issue is created**
3. Action: **Send a notification** → your email / Slack
4. Name: `New error`
5. **Save Rule**

**B. Error spike**

1. **Create Alert** → **Issues** (or **Metric**)
2. Condition: **Number of events in an issue is above** `50` in `1 hour`  
   *(or Metric: `count()` of errors > threshold for the project)*
3. Action: notify Slack/email
4. Name: `Error spike`
5. **Save Rule**

**C. Failed email (from `app_events`)**

Sentry does not read Postgres directly. Use one of:

1. **Preferred ops check:** Supabase → **SQL Editor** → schedule / manually review:

   ```sql
   select created_at, source, metadata
   from public.app_events
   where event_type = 'email_failed'
   order by created_at desc
   limit 50;
   ```

2. **Sentry alert on tagged client errors** (optional): if you also `captureMessage` for email failures later, filter **Tags** `event_type:email_failed`.

3. **Uptime + Slack cron alternative:** a small scheduled job that queries `email_failed` in the last hour and posts to Slack (not shipped in-app).

If you only want Sentry UI: **Alerts** → filter issues containing `sendEmail` / Edge Function names after linking server-side Sentry (optional future work).

---

## 3. Vercel — deployment failure notifications

### Click path

1. Open [https://vercel.com](https://vercel.com) → your **Haven & Co** team/project  
2. Project → **Settings** → **Notifications**  
   *(or Account/Team → **Settings** → **Notifications**)*
3. Enable:
   - **Deployment Failed** (email and/or Slack/Discord integration)
   - Optionally **Deployment Ready** for peace of mind
4. To connect Slack: **Integrations** → search **Slack** → **Add** → choose channel → ensure “Deployment Failed” is enabled for this project

Confirm production builds set release: Vercel provides `VERCEL_GIT_COMMIT_SHA` automatically; Vite maps it to `VITE_APP_RELEASE` for Sentry.

---

## 4. Supabase — usage alerts

### Click path

1. Open [https://supabase.com/dashboard](https://supabase.com/dashboard) → select the project  
2. Bottom-left **Organization** (or project) → **Settings** → **Billing**  
3. Open **Usage** / **Spend Cap** (labels vary by plan):
   - Enable **Spend cap** if you want hard stops on overages  
   - Note DB size, egress, Edge Function invocations, MAUs
4. **Organization Settings** → **Notifications** / **Email** → ensure billing and usage emails go to an inbox you monitor  
5. Project → **Settings** → **Infrastructure** (or **Reports**): watch **Database**, **Auth**, **Storage**, **Edge Functions** charts weekly  
6. Optional: Project → **Database** → **Roles** / slow-query insights if available on your plan

Set calendar reminder: review **Reports** every week for storage growth and function errors.

---

## Quick verification checklist

- [ ] `migration_app_events.sql` applied  
- [ ] `npx supabase functions deploy health --use-api`  
- [ ] Open `/status` → “All systems working”  
- [ ] UptimeRobot A/B/C green  
- [ ] Sentry receives a test error (optional: throw once in a preview deploy)  
- [ ] Vercel “Deployment Failed” notification enabled  
- [ ] Supabase billing/usage emails enabled  
