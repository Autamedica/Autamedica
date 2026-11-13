import type { APIRoute } from "astro";
import { logger } from "@autamedica/shared";
import { createAstroAdminClient } from "@/lib/supabase";

import { readMetricRows } from "@/lib/admin/patient-intelligence-metrics";
import type { MetricClient } from "@/lib/admin/patient-intelligence-metrics";

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
  return typeof appRole === "string" ? appRole : undefined;
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
    const admin = createAstroAdminClient(runtimeEnv) as unknown as MetricClient & {
      rpc<T>(name: string): PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
    };

    // 1. CAPA ORO: Fetch seasonal metrics (preaggregated high-performance OLAP)
    const { data: goldMetrics, error: goldError } = await admin
      .from<GoldSeasonalMetric>("clinical_gold_seasonal_metrics")
      .select("season, symptom_name, snomed_code, icd11_code, case_count") as {
        data: GoldSeasonalMetric[] | null;
        error: { message: string } | null;
      };

    if (goldError) throw new Error(goldError.message);

    // 2. DATA SCIENCE: Run Early Warning Engine (Anomalies & Outbreaks detection)
    const { data: anomalies, error: anomalyError } = await admin
      .rpc<AnomalyDetectionRow>("detect_clinical_anomalies") as {
        data: AnomalyDetectionRow[] | null;
        error: { message: string } | null;
      };

    if (anomalyError) {
      throw new Error("clinical_anomaly_analysis_failed");
    }

    const metrics = admin as unknown as MetricClient;
    const [observations, extractionCount] = await Promise.all([
      readMetricRows<RedFlagObservationRow & { is_red_flag: boolean; anamnesis_extraction_id: string | null }>((from, to) => metrics
        .from<RedFlagObservationRow & { is_red_flag: boolean; anamnesis_extraction_id: string | null }>("clinical_symptom_observations")
        .select("symptom_name, snomed_code, is_red_flag, anamnesis_extraction_id")
        .order("id").range(from, to)),
      metrics.from("anamnesis_extractions").select("*", { count: "exact", head: true }),
    ]);
    if (extractionCount.error || extractionCount.count == null) {
      throw new Error("clinical_extraction_count_unavailable");
    }
    const rawRedFlags = observations.filter(row => row.is_red_flag);
    const extractionsWithSymptoms = new Set(observations.flatMap(row =>
      row.anamnesis_extraction_id ? [row.anamnesis_extraction_id] : [])).size;

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
      data: {
        success: true,
        metrics: {
          extraction_records: extractionCount.count,
          extractions_with_symptoms: extractionsWithSymptoms,
          symptom_observations: observations.length,
          red_flag_observations: rawRedFlags.length,
        },
        seasonal_symptoms: seasonalSymptoms,
        red_flags_ranking: formattedRedFlags,
        early_warning_alerts: (anomalies || []).filter(a => a.is_outbreak_warning || a.percent_increase > 15),
        historical_anomalies: anomalies || [],
      }
    });
  } catch (err) {
    const errorName = err instanceof Error ? err.name : "UnknownError";
    logger.error("[admin/clinical-intelligence] Clinical data query failed", { errorName });
    return json({ success: false, error: "clinical_intelligence_unavailable" }, 503);
  }
};

