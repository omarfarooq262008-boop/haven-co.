import * as Sentry from '@sentry/react'

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g
/** Keys that may carry emails, phones, or chat/form message text. */
const SENSITIVE_KEYS =
  /^(email|e-mail|phone|mobile|tel|message|messages|body|note|text|content|msg|chat|comment|password|token|secret|authorization|visitor_email|visitor_phone|visitor_name|full_name|description)$/i

function scrubString(value: string): string {
  return value.replace(EMAIL_RE, '[email]').replace(PHONE_RE, '[phone]')
}

function scrubUnknown(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value
  if (typeof value === 'string') return scrubString(value)
  if (Array.isArray(value)) return value.map((item) => scrubUnknown(item, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.test(key)) {
        out[key] = '[Filtered]'
      } else {
        out[key] = scrubUnknown(nested, depth + 1)
      }
    }
    return out
  }
  return value
}

function resolveEnvironment(): string {
  const vercelEnv = (import.meta.env.VITE_VERCEL_ENV as string | undefined)?.trim()
  if (vercelEnv === 'production' || vercelEnv === 'preview') return vercelEnv
  if (import.meta.env.PROD) return 'production'
  return 'development'
}

function resolveRelease(): string | undefined {
  const sha =
    (import.meta.env.VITE_APP_RELEASE as string | undefined)?.trim() ||
    (import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA as string | undefined)?.trim() ||
    ''
  return sha ? `haven-co@${sha}` : undefined
}

export function isSentryEnabled(): boolean {
  return Boolean(import.meta.env.VITE_SENTRY_DSN?.trim())
}

/** Initialise Sentry when VITE_SENTRY_DSN is set. Safe no-op otherwise. */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim()
  if (!dsn) return

  try {
    Sentry.init({
      dsn,
      environment: resolveEnvironment(),
      release: resolveRelease(),
      // Performance tracing at 10% — keep cost low; PII still scrubbed below.
      tracesSampleRate: 0.1,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        stackFrameVariables: false,
        databaseQueryData: false,
        genAI: { inputs: false, outputs: false },
        graphQL: { document: false, variables: false },
      },
      beforeBreadcrumb(breadcrumb) {
        if (breadcrumb.message) breadcrumb.message = scrubString(breadcrumb.message)
        if (breadcrumb.data) {
          const data = { ...breadcrumb.data } as Record<string, unknown>
          delete data.request_body
          delete data.response_body
          delete data.body
          delete data['Request Body']
          delete data['Response Body']
          breadcrumb.data = scrubUnknown(data) as Record<string, unknown>
        }
        // Drop noisy / high-risk breadcrumbs that often include form or chat content
        if (breadcrumb.category === 'console' && breadcrumb.level === 'log') {
          return null
        }
        if (breadcrumb.category === 'ui.input' || breadcrumb.category === 'ui.input.keypress') {
          return null
        }
        return breadcrumb
      },
      beforeSend(event) {
        if (event.user) {
          delete event.user.email
          delete event.user.username
          delete event.user.ip_address
          // Keep a non-PII id if present
          if (event.user.id && typeof event.user.id === 'string' && event.user.id.includes('@')) {
            delete event.user.id
          }
        }

        if (event.request) {
          delete event.request.cookies
          delete event.request.data
          delete event.request.headers
          if (event.request.query_string) event.request.query_string = ''
          if (typeof event.request.url === 'string') {
            event.request.url = event.request.url.split('?')[0] ?? event.request.url
          }
        }

        if (event.message) event.message = scrubString(event.message)

        if (event.exception?.values) {
          for (const exception of event.exception.values) {
            if (exception.value) exception.value = scrubString(exception.value)
          }
        }

        if (event.extra) event.extra = scrubUnknown(event.extra) as typeof event.extra
        if (event.contexts) event.contexts = scrubUnknown(event.contexts) as typeof event.contexts
        if (event.tags) {
          for (const [key, value] of Object.entries(event.tags)) {
            if (SENSITIVE_KEYS.test(key)) delete event.tags[key]
            else if (typeof value === 'string') event.tags[key] = scrubString(value)
          }
        }

        // Never attach breadcrumbs that still look like chat payloads
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map((b) => {
            if (b.data) b.data = scrubUnknown(b.data) as typeof b.data
            if (b.message) b.message = scrubString(b.message)
            return b
          })
        }

        return event
      },
    })
  } catch (err) {
    console.warn('[sentry] init failed', err)
  }
}

/** Capture after initSentry (safe if DSN missing). */
export function captureAppError(error: unknown, componentStack?: string | null): void {
  if (!isSentryEnabled()) return
  try {
    Sentry.captureException(error, {
      contexts: componentStack ? { react: { componentStack } } : undefined,
    })
  } catch {
    /* ignore */
  }
}

/** Admin test route helper — no-op when DSN is unset. */
export function sendTestMessage(message = 'Haven Sentry test message'): string {
  if (!isSentryEnabled()) {
    return 'Sentry is not configured (VITE_SENTRY_DSN missing).'
  }
  try {
    Sentry.captureMessage(message, 'info')
    return 'Test message sent to Sentry.'
  } catch {
    return 'Could not send test message.'
  }
}

export { Sentry }
