import type { APIRoute } from "astro";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@autamedica/types";
import { logger } from "@autamedica/shared";
import { createAstroAdminClient } from "@/lib/supabase";

export const prerender = false;

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

type RuntimeEnv = Record<string, unknown> | null | undefined;

function readEnv(runtimeEnv: RuntimeEnv, key: string): string {
  const runtimeValue = runtimeEnv?.[key];
  if (typeof runtimeValue === "string" && runtimeValue.length > 0)
    return runtimeValue;
  const importValue = import.meta.env[key];
  return typeof importValue === "string" ? importValue : "";
}

function isLocalDevBypass(request: Request): boolean {
  const url = new URL(request.url);
  return (
    import.meta.env.DEV &&
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
    url.searchParams.get("dev_admin") === "1"
  );
}

const ADMIN_ROLES = ["admin", "organization_admin", "platform_admin"] as const;

function getMetadataRole(user: App.Locals["session"]["user"] | undefined): string | undefined {
  const appRole = (user?.app_metadata as Record<string, unknown> | undefined)?.role;
  if (typeof appRole === "string") return appRole;

  const userRole = (user?.user_metadata as Record<string, unknown> | undefined)?.role;
  return typeof userRole === "string" ? userRole : undefined;
}

async function isAuthorized(
  locals: App.Locals,
  request: Request,
  runtimeEnv: RuntimeEnv,
): Promise<boolean> {
  if (isLocalDevBypass(request)) return true;

  const user = locals.session?.user;
  const role = getMetadataRole(user);
  if (role && ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number])) return true;

  if (user?.id) {
    try {
      const admin = createAstroAdminClient(runtimeEnv);
      const { data } = await admin
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (
        data?.role &&
        ADMIN_ROLES.includes(data.role as (typeof ADMIN_ROLES)[number])
      ) {
        return true;
      }
    } catch (e) {
      logger.error("[admin/clinical-intelligence] Failed db role check in authorization", e);
    }
  }

  const secret =
    readEnv(runtimeEnv, "CRON_SECRET") || readEnv(runtimeEnv, "TRIGGER_KEY");
  if (!secret) return false;
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const triggerKey = request.headers.get("x-trigger-key");
  return bearer === secret || triggerKey === secret;
}

function json(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

// Seasonal detection for CABA/Argentina (Southern Hemisphere)
function getSouthernHemisphereSeason(dateStr: string): "Verano" | "Otoño" | "Invierno" | "Primavera" {
  const date = new Date(dateStr);
  const month = date.getMonth(); // 0-indexed (0: Jan, 11: Dec)
  const day = date.getDate();

  // Summer: Dec 21 - Mar 20
  if ((month === 11 && day >= 21) || month === 0 || month === 1 || (month === 2 && day <= 20)) {
    return "Verano";
  }
  // Autumn: Mar 21 - Jun 20
  if ((month === 2 && day >= 21) || month === 3 || month === 4 || (month === 5 && day <= 20)) {
    return "Otoño";
  }
  // Winter: Jun 21 - Sep 20
  if ((month === 5 && day >= 21) || month === 6 || month === 7 || (month === 8 && day <= 20)) {
    return "Invierno";
  }
  // Spring: Sep 21 - Dec 20
  return "Primavera";
}

interface SilverSymptomObservationRow {
  created_at: string;
  symptom_name: string;
  is_primary: boolean;
  is_red_flag: boolean;
  patients: {
    age_months: number | null;
  } | null;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const runtimeEnv = locals.runtime?.env;
  if (!(await isAuthorized(locals, request, runtimeEnv))) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const admin = createAstroAdminClient(
      runtimeEnv,
    ) as unknown as SupabaseClient<Database>;

    // Capa Plata Query: Read structured symptom observations with highly optimized indexed join
    const { data: rawObservations, error } = await admin
      .from("clinical_symptom_observations" as unknown as "patients")
      .select(`
        created_at,
        symptom_name,
        is_primary,
        is_red_flag,
        patients (
          age_months
        )
      `)
      .order("created_at", { ascending: false }) as unknown as { 
        data: SilverSymptomObservationRow[] | null; 
        error: { message: string } | null; 
      };

    if (error) throw new Error(error.message);

    const observations = rawObservations || [];

    // Aggregations
    const seasonalSymptoms: Record<string, Record<string, number>> = {
      Verano: {},
      Otoño: {},
      Invierno: {},
      Primavera: {},
    };

    const ageGroupSymptoms: Record<string, Record<string, number>> = {
      "Pediátrico (0-14 años)": {},
      "Joven Adulto (15-29 años)": {},
      "Adulto (30-59 años)": {},
      "Adulto Mayor (60+ años)": {},
      "Sin especificar": {},
    };

    const totalRedFlags: Record<string, number> = {};
    const uniqueConsultationSymptoms = new Set<string>();

    observations.forEach((item) => {
      const symptomName = item.symptom_name;
      const createdAt = item.created_at;
      if (!symptomName || !createdAt) return;

      const isRedFlag = item.is_red_flag;
      const ageMonths = item.patients?.age_months;

      // 1. Season Aggregation
      const season = getSouthernHemisphereSeason(createdAt);
      if (!isRedFlag) {
        seasonalSymptoms[season][symptomName] = (seasonalSymptoms[season][symptomName] || 0) + 1;
        uniqueConsultationSymptoms.add(symptomName);
      }

      // 2. Age Group Aggregation
      let ageGroup = "Sin especificar";
      if (typeof ageMonths === "number") {
        const years = ageMonths / 12;
        if (years < 15) {
          ageGroup = "Pediátrico (0-14 años)";
        } else if (years < 30) {
          ageGroup = "Joven Adulto (15-29 años)";
        } else if (years < 60) {
          ageGroup = "Adulto (30-59 años)";
        } else {
          ageGroup = "Adulto Mayor (60+ años)";
        }
      }

      if (!isRedFlag) {
        ageGroupSymptoms[ageGroup][symptomName] = (ageGroupSymptoms[ageGroup][symptomName] || 0) + 1;
      }

      // 3. Red Flags count
      if (isRedFlag) {
        totalRedFlags[symptomName] = (totalRedFlags[symptomName] || 0) + 1;
      }
    });

    // Helper to format rankings sorted by count
    const getTopSymptoms = (groupedData: Record<string, number>, limit = 6) => {
      return Object.entries(groupedData)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([name, count]) => ({ name, count }));
    };

    const formattedSeasonal = Object.keys(seasonalSymptoms).reduce((acc, season) => {
      acc[season] = getTopSymptoms(seasonalSymptoms[season]);
      return acc;
    }, {} as Record<string, Array<{ name: string; count: number }>>);

    const formattedAgeGroups = Object.keys(ageGroupSymptoms).reduce((acc, group) => {
      acc[group] = getTopSymptoms(ageGroupSymptoms[group]);
      return acc;
    }, {} as Record<string, Array<{ name: string; count: number }>>);

    return json({
      success: true,
      total_consultations_analyzed: observations.length,
      total_consultations_with_symptoms: uniqueConsultationSymptoms.size,
      seasonal_symptoms: formattedSeasonal,
      age_group_symptoms: formattedAgeGroups,
      red_flags_ranking: getTopSymptoms(totalRedFlags, 8),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "clinical_intelligence_failed";
    logger.error("[admin/clinical-intelligence] Failed to process clinical intelligence using Silver Layer", err);
    return json({ error: "clinical_intelligence_failed", details: errorMsg }, 500);
  }
};
