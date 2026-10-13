# Playwright end-to-end tests

These tests hit a **dedicated test Supabase project**. Never point them at production.

## Required secrets / env

| Variable | Purpose |
| --- | --- |
| `E2E_SUPABASE_URL` | Test project URL (`https://….supabase.co`) |
| `E2E_SUPABASE_ANON_KEY` | Test project anon / publishable key |
| `E2E_ADMIN_EMAIL` | Existing admin user on the test project |
| `E2E_ADMIN_PASSWORD` | That admin’s password |
| `E2E_BASE_URL` | Optional; defaults to `http://127.0.0.1:5173` |

On the test project:

1. Apply `schema.sql` + migrations (same as production).
2. Disable email confirmation (Auth → Providers → Email) so sign-up can log in immediately.
3. Promote the admin user:  
   `update public.profiles set is_admin = true where id = (select id from auth.users where email = 'admin@…');`

## Run locally

```bash
cd frontend
# PowerShell example:
$env:E2E_SUPABASE_URL="https://YOUR_TEST_REF.supabase.co"
$env:E2E_SUPABASE_ANON_KEY="eyJ…"
$env:E2E_ADMIN_EMAIL="admin@example.com"
$env:E2E_ADMIN_PASSWORD="…"
npm run test:e2e
```

Without these variables, specs **skip** so `npm run test` / CI unit jobs stay green.

Install browsers once: `npx playwright install chromium`
