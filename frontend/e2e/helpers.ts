import { expect, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export function requireE2EEnv() {
  const url = process.env.E2E_SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.E2E_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  const adminEmail = process.env.E2E_ADMIN_EMAIL
  const adminPassword = process.env.E2E_ADMIN_PASSWORD

  if (!url || !key) {
    throw new Error(
      'E2E requires E2E_SUPABASE_URL and E2E_SUPABASE_ANON_KEY (test project only — never production).',
    )
  }
  if (!adminEmail || !adminPassword) {
    throw new Error('E2E requires E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD for the admin approval step.')
  }

  return { url, key, adminEmail, adminPassword }
}

export function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`
}

export const fixturePhoto = path.join(here, 'fixtures', 'listing.png')

export async function signUp(page: Page, opts: { email: string; password: string; fullName: string }) {
  await page.goto('/signup')
  await page.getByLabel('Full name').fill(opts.fullName)
  await page.getByLabel('Email').fill(opts.email)
  await page.getByLabel('Password').fill(opts.password)
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page.getByRole('link', { name: 'Add listing' })).toBeVisible({ timeout: 30_000 })
}

export async function logIn(page: Page, opts: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(opts.email)
  await page.getByLabel('Password').fill(opts.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('link', { name: 'Add listing' })).toBeVisible({ timeout: 30_000 })
}

export async function logOut(page: Page) {
  const logout = page.getByRole('button', { name: 'Logout' })
  if (await logout.isVisible().catch(() => false)) {
    await logout.click()
    await expect(page.getByRole('link', { name: 'Login' })).toBeVisible({ timeout: 15_000 })
    return
  }
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.goto('/')
}
