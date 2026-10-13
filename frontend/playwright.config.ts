import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

/**
 * E2E against a dedicated TEST Supabase project only.
 * Required env (never production):
 *   E2E_SUPABASE_URL / VITE_SUPABASE_URL
 *   E2E_SUPABASE_ANON_KEY / VITE_SUPABASE_PUBLISHABLE_KEY
 *   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD
 * Optional: E2E_BASE_URL (default http://127.0.0.1:5173)
 */
const supabaseUrl = process.env.E2E_SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const supabaseKey =
  process.env.E2E_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

if (supabaseUrl && /supabase\.co/i.test(supabaseUrl)) {
  // Soft guard: refuse obvious production project refs if marked
  if (process.env.E2E_ALLOW_PRODUCTION === '1') {
    console.warn('[e2e] E2E_ALLOW_PRODUCTION=1 — ensure this is intentional.')
  }
}

export default defineConfig({
  testDir: path.join(root, 'e2e'),
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: supabaseUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: supabaseKey,
    },
  },
})
