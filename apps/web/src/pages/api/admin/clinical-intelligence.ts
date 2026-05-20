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

interface GoldSeasonalMetric {
  season: string;
  symptom_name: string;
  snomed_code: string | null;
  icd11_code: string | null;
  case_count: number;
}

interface AnomalyDetectionRow {
  symptom: string;
  snomed: string | null;
  last_week_count: number;
  historical_weekly_avg: number;
  percent_increase: number;
  is_outbreak_warning: boolean;
}

interface RedFlagObservationRow {
  symptom_name: string;
  snomed_code: string | null;
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

    // 1. CAPA ORO: Fetch seasonal metrics (preaggregated high-performance OLAP)
    const { data: goldMetrics, error: goldError } = await admin
      .from("clinical_gold_seasonal_metrics" as unknown as "patients")
      .select("season, symptom_name, snomed_code, icd11_code, case_count") as unknown as {
        data: GoldSeasonalMetric[] | null;
        error: { message: string } | null;
      };

    if (goldError) throw new Error(goldError.message);

    // 2. DATA SCIENCE: Run Early Warning Engine (Anomalies & Outbreaks detection)
    const { data: anomalies, error: anomalyError } = await admin
      .rpc("detect_clinical_anomalies") as unknown as {
        data: AnomalyDetectionRow[] | null;
        error: { message: string } | null;
      };

    if (anomalyError) {
      logger.error("[admin/clinical-intelligence] Early warning engine failed", anomalyError);
    }

    // 3. CAPA PLATA: Fetch current Red Flags for live tracking
    const { data: rawRedFlags, error: rfError } = await admin
      .from("clinical_symptom_observations" as unknown as "patients")
      .select("symptom_name, snomed_code")
      .eq("is_red_flag", true) as unknown as {
        data: RedFlagObservationRow[] | null;
        error: { message: string } | null;
      };

    if (rfError) throw new Error(rfError.message);

    // Process Seasonal Symptoms from Gold Layer
    const seasonalSymptoms: Record<string, Array<{ name: string; count: number; snomed?: string | null; icd11?: string | null }>> = {
      Verano: [],
      Otoño: [],
      Invierno: [],
      Primavera: [],
    };

    (goldMetrics || []).forEach((row) => {
      if (seasonalSymptoms[row.season]) {
        seasonalSymptoms[row.season].push({
          name: row.symptom_name,
          count: Number(row.case_count),
          snomed: row.snomed_code,
          icd11: row.icd11_code,
        });
      }
    });

    // Sort seasonal aggregations
    Object.keys(seasonalSymptoms).forEach((season) => {
      seasonalSymptoms[season] = seasonalSymptoms[season]
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);
    });

    // Process Red Flags live count
    const totalRedFlags: Record<string, number> = {};
    (rawRedFlags || []).forEach((row) => {
      totalRedFlags[row.symptom_name] = (totalRedFlags[row.symptom_name] || 0) + 1;
    });

    const formattedRedFlags = Object.entries(totalRedFlags)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));

    return json({
      success: true,
      seasonal_symptoms: seasonalSymptoms,
      red_flags_ranking: formattedRedFlags,
      early_warning_alerts: (anomalies || []).filter(a => a.is_outbreak_warning || a.percent_increase > 15),
      historical_anomalies: anomalies || [],
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "clinical_intelligence_failed";
    logger.error("[admin/clinical-intelligence] Failed to process clinical intelligence from Gold Layer & EWS", err);
    return json({ error: "clinical_intelligence_failed", details: errorMsg }, 500);
  }
};
