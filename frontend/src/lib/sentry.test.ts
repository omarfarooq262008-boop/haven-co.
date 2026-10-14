import { afterEach, describe, expect, it, vi } from 'vitest'

describe('sentry bootstrap', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('reports disabled when VITE_SENTRY_DSN is empty', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '')
    const { isSentryEnabled, initSentry, sendTestMessage } = await import('./sentry')
    expect(isSentryEnabled()).toBe(false)
    expect(() => initSentry()).not.toThrow()
    expect(sendTestMessage()).toMatch(/not configured/i)
  })

  it('reports enabled when VITE_SENTRY_DSN is set', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://examplePublicKey@o0.ingest.sentry.io/0')
    const { isSentryEnabled } = await import('./sentry')
    expect(isSentryEnabled()).toBe(true)
  })
})
