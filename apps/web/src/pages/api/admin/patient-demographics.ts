import type { APIRoute } from "astro";
import { logger } from "@autamedica/shared";
import { createAstroAdminClient } from "@/lib/supabase";

import { readMetricRows, summarizePatientQuality } from "@/lib/admin/patient-intelligence-metrics";
import type { MetricClient, PatientQualityRow } from "@/lib/admin/patient-intelligence-metrics";

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
      logger.error("[admin/patient-demographics] Failed db role check in authorization", e);
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

interface PatientDemographicRow {
  total_active_patients: number;
  gender: string;
  age_group: string;
  region: string;
  insurance_name: string;
  count: number;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const runtimeEnv = locals.runtime?.env;
  if (!(await isAuthorized(locals, request, runtimeEnv))) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const admin = createAstroAdminClient(runtimeEnv) as unknown as MetricClient;
    const [rows, patientRows] = await Promise.all([
      readMetricRows<PatientDemographicRow>((from, to) => admin
        .from<PatientDemographicRow>("v_patient_demographics").select("*")
        .order("gender").order("age_group").order("region").order("insurance_name").range(from, to)),
      readMetricRows<PatientQualityRow>((from, to) => admin
        .from<PatientQualityRow>("patients")
        .select("user_id, birth_date, address, insurance_info")
        .eq("active", true).order("id").range(from, to)),
    ]);
    const population = summarizePatientQuality(patientRows);

    // Aggregate values
    let totalPatients = 0;
    if (rows.length > 0) {
      totalPatients = rows[0].total_active_patients || 0;
    }

    if (totalPatients !== patientRows.length || rows.reduce((sum, row) => sum + Number(row.count), 0) !== totalPatients) {
      throw new Error("Population changed or demographic source is incomplete; retry");
    }

    const byGender: Record<string, number> = {};
    const byAgeGroup: Record<string, number> = {};
    const byRegion: Record<string, number> = {};

    rows.forEach((row) => {
      const count = Number(row.count || 0);

      // Gender
      const g = row.gender || "prefer_not_to_say";
      byGender[g] = (byGender[g] || 0) + count;

      // Age Group
      const ag = row.age_group || "Desconocido";
      byAgeGroup[ag] = (byAgeGroup[ag] || 0) + count;

      // Region
      const reg = row.region || "Sin especificar";
      byRegion[reg] = (byRegion[reg] || 0) + count;
    });

    return json({
      success: true,
      total_patients: population.quality.active_records,
      population_definition: "patients.active = true; enabled records, not service usage",
      data_quality: population.quality,
      geography_source: "legacy_address_text_inference",
      demographics: {
        by_gender: byGender,
        by_age_group: byAgeGroup,
        by_region: byRegion,
        by_insurance: population.by_insurance,
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "demographics_failed";
    logger.error("[admin/patient-demographics] Failed to load demographics data", err);
    return json({ error: "demographics_failed", details: errorMsg }, 500);
  }
};

