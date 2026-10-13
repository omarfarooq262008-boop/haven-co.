import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2"
import { logAppEvent } from "./appEvents.ts"

export type RateLimitResult =
  | { ok: true }
  | { ok: false; status: 429; message: string }

/** Client IP from common proxy headers (Supabase / CDN). */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  return (
    req.headers.get("cf-connecting-ip")?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown"
  )
}

/**
 * Enforce per-IP and optional per-user limits using public.check_edge_rate_limit.
 * Returns a 429 payload when blocked.
 */
export async function enforceEdgeRateLimits(opts: {
  admin: SupabaseClient
  req: Request
  scope: string
  userId?: string | null
  /** Max requests per IP in the window */
  ipMax: number
  /** Window length for IP limit (seconds) */
  ipWindowSeconds: number
  /** Max requests per user in the window (skipped if no userId) */
  userMax?: number
  /** Window length for user limit (seconds) */
  userWindowSeconds?: number
}): Promise<RateLimitResult> {
  const ip = clientIp(opts.req)
  const ipKey = `ip:${opts.scope}:${ip}`

  const { data: ipOk, error: ipError } = await opts.admin.rpc("check_edge_rate_limit", {
    p_key: ipKey,
    p_max_hits: opts.ipMax,
    p_window_seconds: opts.ipWindowSeconds,
  })

  if (ipError) {
    console.error("[rateLimit] IP check failed", ipError.message)
    // Fail open on infra errors so email flows are not hard-down
    return { ok: true }
  }

  if (!ipOk) {
    void logAppEvent("rate_limit_hit", "rateLimit", {
      scope: opts.scope,
      kind: "ip",
    })
    return {
      ok: false,
      status: 429,
      message: "Too many requests from this network. Please wait a moment and try again.",
    }
  }

  if (opts.userId && opts.userMax != null && opts.userWindowSeconds != null) {
    const userKey = `user:${opts.scope}:${opts.userId}`
    const { data: userOk, error: userError } = await opts.admin.rpc("check_edge_rate_limit", {
      p_key: userKey,
      p_max_hits: opts.userMax,
      p_window_seconds: opts.userWindowSeconds,
    })

    if (userError) {
      console.error("[rateLimit] user check failed", userError.message)
      return { ok: true }
    }

    if (!userOk) {
      void logAppEvent("rate_limit_hit", "rateLimit", {
        scope: opts.scope,
        kind: "user",
      })
      return {
        ok: false,
        status: 429,
        message: "You're doing that too often. Please wait a moment and try again.",
      }
    }
  }

  return { ok: true }
}

export function serviceAdmin(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }
  return createClient(url, key)
}
