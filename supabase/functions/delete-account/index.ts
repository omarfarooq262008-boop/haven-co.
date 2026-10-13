import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { logAppEvent } from "../_shared/appEvents.ts"
import { enforceEdgeRateLimits } from "../_shared/rateLimit.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({ error: "Service is not configured" }, 500)
    }

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return json({ error: "Unauthorized" }, 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: "Unauthorized" }, 401)

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const limited = await enforceEdgeRateLimits({
      admin,
      req,
      scope: "delete-account",
      userId: user.id,
      ipMax: 20,
      ipWindowSeconds: 3600,
      userMax: 5,
      userWindowSeconds: 3600,
    })
    if (!limited.ok) return json({ error: limited.message }, limited.status)

    const { data: prep, error: prepError } = await admin.rpc("prepare_account_deletion", {
      p_user_id: user.id,
    })
    if (prepError) {
      console.error("[delete-account] prepare", prepError.message)
      return json({ error: "Could not prepare account deletion" }, 500)
    }

    const paths = Array.isArray((prep as { image_paths?: unknown })?.image_paths)
      ? ((prep as { image_paths: string[] }).image_paths.filter(Boolean) as string[])
      : []

    if (paths.length) {
      const chunk = 50
      for (let i = 0; i < paths.length; i += chunk) {
        const slice = paths.slice(i, i + chunk)
        const { error: storageError } = await admin.storage.from("listing-images").remove(slice)
        if (storageError) {
          console.error("[delete-account] storage", storageError.message)
          // Continue — auth delete still removes DB rows
        }
      }
    }

    // Cascades remove profile, listings, conversations, messages, bookings, holds, reports
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
    if (deleteError) {
      console.error("[delete-account] auth delete", deleteError.message)
      return json({ error: deleteError.message }, 500)
    }

    await logAppEvent("account_deleted", "delete-account", {
      listings_removed: (prep as { listing_ids?: unknown[] })?.listing_ids?.length ?? 0,
    })

    return json({ ok: true })
  } catch (err) {
    console.error("[delete-account]", err)
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
