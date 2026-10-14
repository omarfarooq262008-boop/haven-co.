/**
 * Provider-agnostic payment layer for Edge Functions.
 *
 * Set secret PAYMENT_PROVIDER to: mock | safepay | payfast | paymob
 * (default: mock)
 *
 * SECURITY:
 * - Never collect or log card numbers in our code.
 * - createCheckout() only returns a hosted checkout URL (redirect).
 * - Payment success is trusted only via verifyWebhook() (server-to-server).
 */

export type PaymentProviderName = "mock" | "safepay" | "payfast" | "paymob"

export type CreateCheckoutInput = {
  /** Our hold id (metadata for the provider) */
  holdId: string
  amount: number
  currency: string
  description?: string
  /** Customer email (and optional name) — never card data */
  customer: { email: string; name?: string }
  /** Alias fields also accepted for older callers */
  customerEmail?: string
  returnUrl: string
  cancelUrl: string
  /** Optional explicit failure URL; defaults to returnUrl with status=failed */
  failureUrl?: string
  successUrl?: string
}

export type CreateCheckoutResult = {
  checkoutUrl: string
  providerReference: string
  provider: PaymentProviderName
}

export type WebhookVerification =
  | {
      ok: true
      event: "payment.succeeded" | "payment.failed" | "payment.cancelled"
      providerReference: string
      holdId?: string
      raw?: unknown
    }
  | { ok: false; error: string }

export type RefundInput = {
  providerReference: string
  amount: number
  currency: string
  reason?: string
}

export type RefundResult = { ok: true; refundReference?: string } | { ok: false; error: string }

export interface PaymentProvider {
  name: PaymentProviderName
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>
  verifyWebhook(req: Request, rawBody: string): Promise<WebhookVerification>
  refund(input: RefundInput): Promise<RefundResult>
}

export function getPaymentProviderName(): PaymentProviderName {
  const raw = (Deno.env.get("PAYMENT_PROVIDER") ?? "mock").trim().toLowerCase()
  if (raw === "safepay" || raw === "payfast" || raw === "paymob" || raw === "mock") {
    return raw
  }
  console.warn(`[payments] Unknown PAYMENT_PROVIDER="${raw}", falling back to mock`)
  return "mock"
}

export function getPaymentProvider(): PaymentProvider {
  const name = getPaymentProviderName()
  switch (name) {
    case "mock":
      return mockProvider
    case "safepay":
      return safepayProviderStub
    case "payfast":
      return payfastProvider
    case "paymob":
      return paymobProvider
  }
}

function normalizeCheckoutInput(input: CreateCheckoutInput): Required<
  Pick<CreateCheckoutInput, "holdId" | "amount" | "currency" | "returnUrl" | "cancelUrl">
> & {
  customerEmail: string
  customerName?: string
  successUrl: string
  failureUrl: string
  description: string
} {
  const customerEmail = input.customer?.email?.trim() || input.customerEmail?.trim() || ""
  if (!customerEmail) throw new Error("customer.email is required")
  const successUrl = input.successUrl || input.returnUrl
  const failureUrl = input.failureUrl || input.returnUrl
  return {
    holdId: input.holdId,
    amount: input.amount,
    currency: input.currency,
    returnUrl: input.returnUrl,
    cancelUrl: input.cancelUrl,
    customerEmail,
    customerName: input.customer?.name,
    successUrl,
    failureUrl,
    description: input.description ?? "Property hold",
  }
}

/**
 * Public app origin for checkout redirects.
 * Forces https except for localhost / 127.0.0.1 (local Vite).
 */
export function appUrl(): string {
  let raw = (Deno.env.get("APP_URL") ?? "http://localhost:5173").trim().replace(/\/$/, "")
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`
  }
  try {
    const u = new URL(raw)
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1"
    if (!local) u.protocol = "https:"
    return u.origin
  } catch {
    return "http://localhost:5173"
  }
}

function webhookSecret(): string {
  return (
    Deno.env.get("PAYMENT_WEBHOOK_SECRET")?.trim() ||
    Deno.env.get("MOCK_PAYMENT_SECRET")?.trim() ||
    "dev-mock-payment-secret"
  )
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false
  const aa = new TextEncoder().encode(a)
  const bb = new TextEncoder().encode(b)
  let out = 0
  for (let i = 0; i < aa.length; i++) out |= aa[i]! ^ bb[i]!
  return out === 0
}

/** Sign a mock webhook body (used by the mock checkout Edge Function only). */
export async function signMockWebhookBody(body: string): Promise<string> {
  return hmacSha256Hex(webhookSecret(), body)
}

// ---------------------------------------------------------------------------
// Mock provider — frontend /mock-checkout page (no card fields)
// ---------------------------------------------------------------------------

const mockProvider: PaymentProvider = {
  name: "mock",

  async createCheckout(input) {
    const n = normalizeCheckoutInput(input)
    const providerReference = `mock_${crypto.randomUUID().replaceAll("-", "")}`
    const origin = appUrl()
    // Frontend route — Edge Function is JSON-only and signs webhooks server-side
    const checkoutUrl =
      `${origin}/mock-checkout` +
      `?hold=${encodeURIComponent(n.holdId)}` +
      `&ref=${encodeURIComponent(providerReference)}` +
      `&amount=${encodeURIComponent(String(n.amount))}` +
      `&currency=${encodeURIComponent(n.currency)}` +
      `&success=${encodeURIComponent(n.successUrl)}` +
      `&cancel=${encodeURIComponent(n.cancelUrl)}` +
      `&failure=${encodeURIComponent(n.failureUrl)}`

    return { checkoutUrl, providerReference, provider: "mock" }
  },

  async verifyWebhook(req, rawBody) {
    const signature =
      req.headers.get("x-payment-signature") ??
      req.headers.get("X-Payment-Signature") ??
      ""
    if (!signature) {
      return { ok: false, error: "Missing payment signature" }
    }
    const expected = await hmacSha256Hex(webhookSecret(), rawBody)
    if (!(await timingSafeEqual(signature.toLowerCase(), expected.toLowerCase()))) {
      return { ok: false, error: "Invalid payment signature" }
    }

    let parsed: {
      event?: string
      event_id?: string
      provider_reference?: string
      hold_id?: string
    }
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      return { ok: false, error: "Invalid JSON body" }
    }

    const event = parsed.event
    if (
      event !== "payment.succeeded" &&
      event !== "payment.failed" &&
      event !== "payment.cancelled"
    ) {
      return { ok: false, error: `Unsupported event: ${event ?? "none"}` }
    }
    if (!parsed.provider_reference) {
      return { ok: false, error: "Missing provider_reference" }
    }

    return {
      ok: true,
      event,
      providerReference: parsed.provider_reference,
      holdId: parsed.hold_id,
      raw: parsed,
    }
  },

  async refund(input) {
    console.log("[payments:mock] refund", {
      providerReference: input.providerReference,
      amount: input.amount,
      currency: input.currency,
      reason: input.reason,
    })
    return { ok: true, refundReference: `mock_refund_${crypto.randomUUID().replaceAll("-", "")}` }
  },
}

// Safepay stub — full TODO skeleton lives in providers/safepay.ts
const safepayProviderStub: PaymentProvider = {
  name: "safepay",
  async createCheckout(_input) {
    throw new Error(
      "Safepay is not configured yet. Set PAYMENT_PROVIDER=mock, or implement providers/safepay.ts from Safepay docs.",
    )
  },
  async verifyWebhook(_req, _rawBody) {
    return { ok: false, error: "Safepay webhook verification not implemented — see providers/safepay.ts" }
  },
  async refund(_input) {
    return { ok: false, error: "Safepay refund not implemented — see providers/safepay.ts" }
  },
}

// ---------------------------------------------------------------------------
// PLACEHOLDER: PayFast (Pakistan) — plug in hosted checkout later
// Secrets (when ready): PAYFAST_MERCHANT_ID, PAYFAST_SECURED_KEY, PAYFAST_WEBHOOK_SECRET
// ---------------------------------------------------------------------------

const payfastProvider: PaymentProvider = {
  name: "payfast",
  async createCheckout(_input) {
    throw new Error(
      "PayFast is not configured yet. Set PAYMENT_PROVIDER=mock for testing, or implement PayFast createCheckout in _shared/payments.ts.",
    )
  },
  async verifyWebhook(_req, _rawBody) {
    // TODO: verify PayFast IPN / signature
    return { ok: false, error: "PayFast webhook verification not implemented" }
  },
  async refund(_input) {
    // TODO: call PayFast refund API
    return { ok: false, error: "PayFast refund not implemented" }
  },
}

// ---------------------------------------------------------------------------
// PLACEHOLDER: Paymob — plug in hosted / iframe checkout later
// Secrets (when ready): PAYMOB_API_KEY, PAYMOB_INTEGRATION_ID, PAYMOB_HMAC_SECRET
// Prefer hosted redirect or their embedded field — never a custom card form.
// ---------------------------------------------------------------------------

const paymobProvider: PaymentProvider = {
  name: "paymob",
  async createCheckout(_input) {
    throw new Error(
      "Paymob is not configured yet. Set PAYMENT_PROVIDER=mock for testing, or implement Paymob createCheckout in _shared/payments.ts.",
    )
  },
  async verifyWebhook(_req, _rawBody) {
    // TODO: verify Paymob HMAC and transaction success
    return { ok: false, error: "Paymob webhook verification not implemented" }
  },
  async refund(_input) {
    // TODO: call Paymob refund API
    return { ok: false, error: "Paymob refund not implemented" }
  },
}

