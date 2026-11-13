import type { APIRoute } from "astro";
import { logger } from "@autamedica/shared";
import { createAstroAdminClient } from "@/lib/supabase";

export const prerender = false;
const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/**
 * POST /api/admin/sync-profiles
 * Sincroniza perfiles reales de Supabase hacia Growth OS.
 * Excluye administradores y datos de prueba.
 * Respeta newsletter_subscribed marcando como 'unsubscribed' si es false.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);

  // Validación de entorno local para bypass
  const isLocalDevBypass =
    import.meta.env.DEV &&
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
    url.searchParams.get("dev_admin") === "1";

  // Check auth
  const session = locals.session;
  let isAuth = false;
  if (session) {
    const role = (session.user.app_metadata as Record<string, unknown>)?.role;
    if (
      typeof role === "string" &&
      ["admin", "organization_admin", "platform_admin"].includes(role)
    ) {
      isAuth = true;
    }
  }

  if (!isLocalDevBypass && !isAuth) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);

    // Obtenemos profiles creados en los últimos 30 días que no sean admin ni @autamedica.test
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select(
        "user_id, email, first_name, last_name, role, newsletter_subscribed, created_at",
      )
      .gte("created_at", since)
      .not("email", "ilike", "%@autamedica.test")
      .not("role", "in", '("admin", "platform_admin", "organization_admin")');

    if (profilesError) throw profilesError;

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ message: "No profiles to sync" }), {
        status: 200,
        headers: JSON_HEADERS,
      });
    }

    const leadsToInsert = profiles
      .map((p) => ({
        email: p.email?.toLowerCase().trim(),
        name: [p.first_name, p.last_name].filter(Boolean).join(" ") || null,
        vertical: p.role || "general",
        intent: "profile_sync",
        form_id: "supabase_profiles",
        status: p.newsletter_subscribed === false ? "unsubscribed" : "new",
        consent_marketing: p.newsletter_subscribed === true,
        consent_source: "profile_registration",
        first_utm_source: "public.profiles",
        first_utm_medium: "sync",
        created_at: p.created_at,
      }))
      .filter((l) => l.email);

    if (leadsToInsert.length === 0) {
      return new Response(
        JSON.stringify({ message: "No valid emails to sync" }),
        { status: 200, headers: JSON_HEADERS },
      );
    }

    const { error: upsertError } = await (admin as any)
      .schema("growth_os")
      .from("leads")
      .upsert(leadsToInsert, {
        onConflict: "email_normalized,form_id,vertical",
        ignoreDuplicates: true,
      });

    if (upsertError) throw upsertError;

    return new Response(
      JSON.stringify({
        success: true,
        synced_count: leadsToInsert.length,
      }),
      { status: 200, headers: JSON_HEADERS },
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error("[growth/sync-profiles] Error syncing", {
      error,
    });
    return new Response(JSON.stringify({ error }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
};
