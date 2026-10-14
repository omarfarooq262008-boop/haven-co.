/**
 * PLACEHOLDER — Safepay (Pakistan) hosted checkout
 * =================================================
 * Do NOT invent API URLs or field names. Before going live:
 *   1. Read Safepay’s current merchant docs (hosted / redirect checkout).
 *   2. Fill in createCheckout / verifyWebhook / refund using those docs only.
 *   3. Set secrets (names are provisional — confirm in Safepay dashboard):
 *        SAFEPAY_API_KEY
 *        SAFEPAY_WEBHOOK_SECRET
 *        SAFEPAY_ENV          (e.g. sandbox | production)
 *   4. Set PAYMENT_PROVIDER=safepay on the Edge Functions.
 *
 * Rules for Haven & Co:
 *   - Hosted checkout redirect only — never a custom card form.
 *   - Trust payment success only from verifyWebhook (server-to-server).
 *   - Never log PAN / CVV / full card numbers.
 */

import type { CreateCheckoutInput, CreateCheckoutResult, RefundInput, RefundResult, WebhookVerification } from "../payments.ts"

export const safepayProvider = {
  name: "safepay" as const,

  async createCheckout(_input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    // TODO(safepay): POST to Safepay “create session / payment” endpoint from their docs.
    // Map: amount, currency (PKR), holdId → metadata, returnUrl/cancelUrl → redirect URLs.
    // Return { checkoutUrl, providerReference, provider: "safepay" }.
    throw new Error(
      "Safepay is not configured yet. Set PAYMENT_PROVIDER=mock for testing, or implement createCheckout in providers/safepay.ts after reading Safepay docs.",
    )
  },

  async verifyWebhook(_req: Request, _rawBody: string): Promise<WebhookVerification> {
    // TODO(safepay):
    // 1. Read signature header name from Safepay docs.
    // 2. Verify HMAC / signature with SAFEPAY_WEBHOOK_SECRET.
    // 3. Parse event type + provider reference + our holdId from metadata.
    // 4. Return { ok: true, event, providerReference, holdId } or { ok: false, error }.
    return { ok: false, error: "Safepay webhook verification not implemented — see providers/safepay.ts" }
  },

  async refund(_input: RefundInput): Promise<RefundResult> {
    // TODO(safepay): call Safepay refund API with providerReference + amount (PKR).
    return { ok: false, error: "Safepay refund not implemented — see providers/safepay.ts" }
  },
}
