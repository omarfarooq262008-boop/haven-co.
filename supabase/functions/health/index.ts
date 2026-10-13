import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { logAppEvent } from "../_shared/appEvents.ts"
import { enforceEdgeRateLimits } from "../_shared/rateLimit.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type CheckResult = { ok: boolean }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const started = Date.now()

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json(
        {
          status: "error",
          checks: { database: "fail", storage: "fail", auth: "fail" },
          ms: Date.now() - started,
        },
        503,
      )
    }

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const limited = await enforceEdgeRateLimits({
      admin,
      req,
      scope: "health",
      ipMax: 60,
      ipWindowSeconds: 60,
    })
    if (!limited.ok) {
      return json({ status: "error", error: "rate_limited" }, limited.status)
    }

    const [database, storage, auth] = await Promise.all([
      checkDatabase(admin),
      checkStorage(admin),
      checkAuth(admin),
    ])

    const allOk = database.ok && storage.ok && auth.ok
    const body = {
      status: allOk ? "ok" : "error",
      checks: {
        database: database.ok ? "ok" : "fail",
        storage: storage.ok ? "ok" : "fail",
        auth: auth.ok ? "ok" : "fail",
      },
      ms: Date.now() - started,
    }

    if (!allOk) {
      await logAppEvent("health_check_failed", "health", {
        database: database.ok,
        storage: storage.ok,
        auth: auth.ok,
      })
    }

    return json(body, allOk ? 200 : 503)
  } catch (err) {
    console.error("[health]", err instanceof Error ? err.message : err)
    await logAppEvent("health_check_failed", "health", { reason: "unexpected" })
    return json(
      {
        status: "error",
        checks: { database: "fail", storage: "fail", auth: "fail" },
        ms: Date.now() - started,
      },
      503,
    )
  }
})

async function checkDatabase(admin: ReturnType<typeof createClient>): Promise<CheckResult> {
  try {
    const { error } = await admin.from("listings").select("id").limit(1)
    if (error) {
      console.error("[health] database", error.message)
      return { ok: false }
    }
    return { ok: true }
  } catch (err) {
    console.error("[health] database", err)
    return { ok: false }
  }
}

async function checkStorage(admin: ReturnType<typeof createClient>): Promise<CheckResult> {
  try {
    const { data, error } = await admin.storage.listBuckets()
    if (error) {
      console.error("[health] storage", error.message)
      return { ok: false }
    }
    const hasListings = (data ?? []).some((b) => b.name === "listing-images" || b.id === "listing-images")
    if (!hasListings) {
      console.error("[health] storage missing listing-images bucket")
      return { ok: false }
    }
    return { ok: true }
  } catch (err) {
    console.error("[health] storage", err)
    return { ok: false }
  }
}

async function checkAuth(admin: ReturnType<typeof createClient>): Promise<CheckResult> {
  try {
    const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
    if (error) {
      console.error("[health] auth", error.message)
      return { ok: false }
    }
    return { ok: true }
  } catch (err) {
    console.error("[health] auth", err)
    return { ok: false }
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  })
}
