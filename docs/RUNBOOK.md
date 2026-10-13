# Runbook — Haven & Co

Operational playbook for outages, email failures, paused databases, secret rotation, Vercel rollbacks, and backup restore.

## Quick triage

| Symptom | First check |
| --- | --- |
| Site blank / 5xx | Vercel deployment status → `/status` → UptimeRobot |
| API errors in UI | Supabase project status (paused?) → Edge `health` |
| No emails | Resend dashboard → Edge Function logs → SMTP secrets |
| Login broken | Auth providers / SMTP for magic links → rate limits |
| Images missing | Storage bucket policies → CDN cache |

Health: `GET https://YOUR_PROJECT_REF.supabase.co/functions/v1/health`  
(with `apikey` + `Authorization: Bearer` = anon key)

SPA: `https://YOUR_SITE/status`

---

## Site is down

1. **Confirm scope** — Open production URL, `/status`, and the health Edge Function. Note whether DNS, static host, or API failed.
2. **Vercel** — [Dashboard](https://vercel.com) → project → **Deployments**. If the latest deploy is **Error** or **Building**, roll back (see below). Check **Domains** for SSL/DNS.
3. **Supabase paused** — Free projects pause after inactivity. Dashboard → project → **Restore** / resume. Wait for green status, then re-hit health.
4. **Edge / RLS regressions** — Function logs (Edge Functions → Logs). Recent migration that broke RLS? Revert migration SQL or redeploy last known-good functions:
   ```bash
   npx supabase functions deploy health --use-api
   ```
5. **Client config** — Confirm Vercel env still has `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. A missing key ships a broken SPA after rebuild.
6. **Communicate** — If prolonged, set a status note; avoid force-pushing `main` (Lovable sync).

---

## Emails stop

Booking / message / listing emails go through Edge Functions → **Resend** (primary) or **Gmail SMTP** (fallback).

1. Open **Supabase → Edge Functions → Logs** for `send-booking-email`, `notify-new-message`, `notify-listing-review`.
2. **Resend** — Dashboard → API keys & logs. 401 → rotate `RESEND_API_KEY` in Edge secrets. Domain not verified → fix DNS or switch to SMTP fallback.
3. **SMTP fallback** — Confirm Edge secrets: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (or project-specific names in function code). Gmail often needs an **App Password** and may block datacenter IPs — if Resend works and SMTP fails, prefer Resend.
4. **Auth emails** (signup/reset) are **Supabase Auth**, not Resend. Check Authentication → SMTP settings / rate limits / spam.
5. Redeploy the affected function after secret changes:
   ```bash
   npx supabase secrets set RESEND_API_KEY=re_xxx
   npx supabase functions deploy send-booking-email --use-api
   ```

---

## Database is paused (or unreachable)

1. Supabase Dashboard → project. If **Paused**, click **Restore project** and wait until healthy.
2. Confirm connection: run health function or a trivial SQL select in the SQL editor.
3. Free tier may pause again after idle — schedule weekly traffic (UptimeRobot on health) or upgrade compute.
4. If the project was **deleted**, restore from the weekly GitHub artifact (below). Storage **file bytes** are not in the dump — only object metadata; images may need re-upload unless you have a separate object backup.

---

## Rotate each secret

| Secret | Where used | How to rotate |
| --- | --- | --- |
| **Supabase anon / publishable key** | Vercel `VITE_SUPABASE_PUBLISHABLE_KEY`, SPA | Dashboard → API → rotate anon if compromised; update Vercel env; **Redeploy** frontend. |
| **Supabase service role** | Edge Functions only | Rotate in Dashboard → API; `npx supabase secrets set` / Dashboard secrets; redeploy all functions. Never put in Vercel `VITE_*`. |
| **Database password / DATABASE_URL** | GitHub Actions backup, any direct SQL clients | Database Settings → reset password; update GitHub secret `DATABASE_URL` (URI with new password). |
| **RESEND_API_KEY** | Edge email | Resend → create key, revoke old; `supabase secrets set`; redeploy email functions. |
| **SMTP_*** | Edge email fallback | New Gmail app password; update secrets; redeploy. |
| **Payment / webhook secrets** | `create-hold-checkout`, `payment-webhook` | Provider dashboard → new secret; update Edge secrets; redeploy both. |
| **VITE_SENTRY_DSN** | SPA | Sentry → Client Keys; update Vercel env; redeploy. |
| **GitHub Actions secrets** | Backup / CI | Repo → Settings → Secrets and variables → Actions. |

After any `VITE_*` change: trigger a **new Vercel deployment** (env is baked in at build time).

---

## Roll back a bad deploy (Vercel)

1. Vercel → project → **Deployments**.
2. Find the last **Ready** deployment that worked.
3. Open **⋯** → **Promote to Production** (or **Instant Rollback** if shown).
4. Confirm production URL and `/status`.
5. Fix forward on a branch; do **not** force-push rewritten history on the Lovable-connected branch.

If the bad change was only Edge Functions, redeploy the previous function bundle from git:

```bash
git checkout <good-sha> -- supabase/functions/<name>
npx supabase functions deploy <name> --use-api
```

---

## Database restore from weekly artifact

### Prerequisites

- Repo secret `DATABASE_URL` set (Session or direct Postgres URI).
- Workflow: `.github/workflows/backup.yml` (weekly + manual **workflow_dispatch**).
- Artifact name: `haven-co-db-backup` (private to the repo; retention ~90 days).

### Download

1. GitHub → **Actions** → **Weekly database backup** → latest successful run.
2. Artifacts → download `haven-co-db-backup`.
3. Extract the `.tar.gz` → folder with `haven-co.dump`, `storage-*.csv`, `README.txt`.

### Restore Postgres

**Warning:** Restoring overwrites data. Prefer a new branch/project or maintenance window.

```bash
# Inspect
pg_restore --list haven-co.dump | head

# Restore into an empty or staging database (example)
pg_restore --clean --if-exists --no-owner --no-acl \
  --dbname="$DATABASE_URL" \
  haven-co.dump
```

For production disaster recovery on the same project, pause traffic (Vercel maintenance / disable deploys), restore, then run app smoke tests (`/`, login, create listing, health).

### Storage files

`storage-objects.csv` lists paths only. To rehydrate images you need either:

- Supabase’s own backups / PITR (paid), or
- A separate object backup you maintain, or
- Owner re-uploads.

After DB restore, verify bucket policies still allow public read for listing images.

### Test the backup job

Actions → **Weekly database backup** → **Run workflow**. Confirm artifact appears and size is non-trivial.

---

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — system diagram & permissions
- [SCALING.md](./SCALING.md) — free-tier limits & upgrade order
- [MONITORING.md](./MONITORING.md) — UptimeRobot, Sentry, health
