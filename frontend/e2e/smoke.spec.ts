import { expect, test } from '@playwright/test'
import {
  fixturePhoto,
  logIn,
  logOut,
  requireE2EEnv,
  signUp,
  uniqueEmail,
} from './helpers'

/**
 * Full happy path against a dedicated TEST Supabase project.
 * Skips automatically when E2E secrets are missing (CI unit job stays green).
 */
test.describe('Haven & Co smoke', () => {
  test.beforeEach(() => {
    try {
      requireE2EEnv()
    } catch (err) {
      test.skip(true, err instanceof Error ? err.message : 'E2E env not configured')
    }
  })

  test('sign up, list, approve, filter, message, book', async ({ page }) => {
    const { adminEmail, adminPassword } = requireE2EEnv()
    const password = 'TestPass123!'
    const ownerEmail = uniqueEmail('owner')
    const buyerEmail = uniqueEmail('buyer')
    const listingTitle = `E2E Villa ${Date.now()}`

    // --- Owner signs up and adds a sale listing ---
    await signUp(page, { email: ownerEmail, password, fullName: 'E2E Owner' })
    await page.getByRole('link', { name: 'Add listing' }).click()
    await expect(page.getByRole('heading', { name: 'Add listing' })).toBeVisible()

    await page.getByLabel('Title').fill(listingTitle)
    await page
      .getByLabel('Description')
      .fill('Automated e2e listing with enough description text for validation rules.')
    await page.getByText('Sell', { exact: true }).click()
    await page.getByLabel(/^Price/).fill('850000')
    await page.getByLabel('City').fill('Karachi')
    await page.getByLabel('Address').fill('E2E Street 1')
    await page.locator('input[type="file"]').first().setInputFiles(fixturePhoto)
    await page.getByRole('button', { name: 'Submit for review' }).click()
    await expect(page.getByRole('heading', { name: /My listings/i })).toBeVisible({
      timeout: 60_000,
    })

    // --- Admin approves ---
    await logOut(page)
    await logIn(page, { email: adminEmail, password: adminPassword })
    await page.getByRole('link', { name: 'Admin' }).click()
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible()
    const card = page.locator('li').filter({ hasText: listingTitle })
    await expect(card).toBeVisible({ timeout: 30_000 })
    await card.getByRole('button', { name: 'Approve' }).click()
    await expect(card).toHaveCount(0, { timeout: 30_000 })

    // --- Buy / Rent filter ---
    await page.getByRole('link', { name: 'Browse' }).click()
    await page.getByRole('radio', { name: 'Buy' }).click()
    await expect(page.getByRole('heading', { name: listingTitle })).toBeVisible({
      timeout: 30_000,
    })
    await page.getByRole('radio', { name: 'Rent' }).click()
    await expect(page.getByRole('heading', { name: listingTitle })).toHaveCount(0)

    // --- Buyer messages owner and books a meeting ---
    await logOut(page)
    await signUp(page, { email: buyerEmail, password, fullName: 'E2E Buyer' })
    await page.getByRole('link', { name: 'Browse' }).click()
    await page.getByRole('radio', { name: 'Buy' }).click()
    await page.getByRole('heading', { name: listingTitle }).click()
    await page.getByRole('button', { name: 'Message owner' }).click()
    await expect(page.getByPlaceholder(/write a message/i)).toBeVisible({ timeout: 30_000 })
    await page.getByPlaceholder(/write a message/i).fill('Hi, interested in a viewing via e2e.')
    await page.getByRole('button', { name: /^Send$/i }).click()
    await expect(page.getByText('Hi, interested in a viewing via e2e.')).toBeVisible()

    await page.getByRole('link', { name: 'Browse' }).click()
    await page.getByRole('heading', { name: listingTitle }).click()
    await page.getByRole('link', { name: 'Book a meeting' }).click()
    await expect(page.getByRole('heading', { name: 'Book a meeting' })).toBeVisible()

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 2)
    const yyyy = tomorrow.getFullYear()
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0')
    const dd = String(tomorrow.getDate()).padStart(2, '0')
    await page.getByLabel('Date').fill(`${yyyy}-${mm}-${dd}`)
    await page.getByLabel('Time slot').selectOption({ index: 1 })
    await page.getByRole('button', { name: 'Confirm meeting' }).click()
    await expect(page.getByRole('heading', { name: 'My bookings' })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText(listingTitle)).toBeVisible()
  })

  test('log in with existing admin', async ({ page }) => {
    const { adminEmail, adminPassword } = requireE2EEnv()
    await logIn(page, { email: adminEmail, password: adminPassword })
    await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible()
  })
})
