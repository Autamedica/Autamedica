/**
 * Use Case: Neuro Stability Evaluation (Capa 3).
 * Integrates Extraction results with Vitals to compute the Stability Score.
 * Handles high-complexity CNS stimulants treatments.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@autamedica/types";
import { logger } from "@autamedica/shared";
import { NeuroScoringEngine, type ScoringResult } from "../scoring.engine";
import { createAnamnesisExtractionAdapter } from "@/lib/patients/lib/repos/anamnesis-extraction.adapter";
import { requiresStrictPrescriptionValidation } from "@/lib/prescriptions/strict-validation";

type Db = SupabaseClient<Database>;

type CorePrescriptionStatus = Database["public"]["Tables"]["prescriptions"]["Row"]["status"];

interface CorePrescriptionRow {
  id: string;
  created_at: string;
  status: CorePrescriptionStatus;
  cuir: string | null;
  qr_code_content: string | null;
  signed_pdf_url: string | null;
  clinical_data: unknown;
}

interface LegacyPrescriptionRow {
  id: string;
  created_at: string | null;
  title: string;
  content: unknown;
}

interface PrescriptionContent {
  medication_name?: string;
  dosage?: string;
  diagnosis?: string | null;
  status?: string;
  clinical_status?: string;
  prescribed_date?: string;
  start_date?: string;
  end_date?: string | null;
  [key: string]: unknown;
}

interface EligibleNeuroPrescription {
  id: string;
  source: "prescriptions_core" | "legacy";
  medication_name: string;
  dosage: string | null;
  diagnosis: string | null;
  prescribed_date: string;
  issuance_status: CorePrescriptionStatus | null;
  has_verifiable_artifact: boolean;
}

export interface EvaluateStabilityInput {
  patientId: string;
  anamnesisId: string;
}

function asObject(value: unknown): PrescriptionContent {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as PrescriptionContent)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isClinicallyActive(
  status: string | null,
  endDate: string | null,
  now = new Date(),
): boolean {
  if (
    status &&
    ["cancelada", "completada", "cancelled", "expired"].includes(status.toLowerCase())
  ) {
    return false;
  }

  if (endDate && new Date(endDate) < now) {
    return false;
  }

  return (
    !status ||
    ["activa", "active", "signed", "sent", "dispensed_partial", "dispensed_total"].includes(
      status.toLowerCase(),
    )
  );
}

function mapCoreRowToEligiblePrescription(
  row: CorePrescriptionRow,
  now = new Date(),
): EligibleNeuroPrescription | null {
  const content = asObject(row.clinical_data);
  const medicationName = asString(content.medication_name);
  if (!medicationName || !requiresStrictPrescriptionValidation(medicationName)) {
    return null;
  }

  const clinicalStatus = asString(content.clinical_status) ?? asString(content.status);
  const endDate = asString(content.end_date);
  const issuanceEligible = ["signed", "sent", "dispensed_partial", "dispensed_total"].includes(
    row.status,
  );
  if (!issuanceEligible || !isClinicallyActive(clinicalStatus, endDate, now)) {
    return null;
  }

  return {
    id: row.id,
    source: "prescriptions_core",
    medication_name: medicationName,
    dosage: asString(content.dosage),
    diagnosis: asString(content.diagnosis),
    prescribed_date:
      asString(content.prescribed_date) ?? asString(content.start_date) ?? row.created_at,
    issuance_status: row.status,
    has_verifiable_artifact: Boolean(row.cuir && (row.qr_code_content || row.signed_pdf_url)),
  };
}

function mapLegacyRowToEligiblePrescription(
  row: LegacyPrescriptionRow,
  now = new Date(),
): EligibleNeuroPrescription | null {
  const content = asObject(row.content);
  const medicationName =
    asString(content.medication_name) ?? row.title.replace(/^Prescripci[oó]n:\s*/i, "").trim();
  if (!medicationName || !requiresStrictPrescriptionValidation(medicationName)) {
    return null;
  }

  const clinicalStatus = asString(content.clinical_status) ?? asString(content.status);
  const endDate = asString(content.end_date);
  if (!isClinicallyActive(clinicalStatus, endDate, now)) {
    return null;
  }

  return {
    id: row.id,
    source: "legacy",
    medication_name: medicationName,
    dosage: asString(content.dosage),
    diagnosis: asString(content.diagnosis),
    prescribed_date:
      asString(content.prescribed_date) ??
      asString(content.start_date) ??
      row.created_at ??
      new Date().toISOString(),
    issuance_status: null,
    has_verifiable_artifact: false,
  };
}

function pickEligibleNeuroPrescription(
  coreRows: CorePrescriptionRow[],
  legacyRows: LegacyPrescriptionRow[],
  now = new Date(),
): EligibleNeuroPrescription | null {
  const coreEligible = coreRows
    .map((row) => mapCoreRowToEligiblePrescription(row, now))
    .filter((row): row is EligibleNeuroPrescription => row !== null)
    .sort(
      (left, right) =>
        new Date(right.prescribed_date).getTime() - new Date(left.prescribed_date).getTime(),
    );

  if (coreEligible.length > 0) {
    return coreEligible[0];
  }

  const legacyEligible = legacyRows
    .map((row) => mapLegacyRowToEligiblePrescription(row, now))
    .filter((row): row is EligibleNeuroPrescription => row !== null)
    .sort(
      (left, right) =>
        new Date(right.prescribed_date).getTime() - new Date(left.prescribed_date).getTime(),
    );

  return legacyEligible[0] ?? null;
}

export async function evaluateNeuroStability(
  supabase: Db,
  input: EvaluateStabilityInput,
): Promise<ScoringResult | null> {
  const { patientId, anamnesisId } = input;

  try {
    const [corePrescriptionRows, legacyPrescriptionRows] = await Promise.all([
      supabase
        .from("prescriptions")
        .select("id, created_at, status, cuir, qr_code_content, signed_pdf_url, clinical_data")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (error) throw error;
          return (data ?? []) as CorePrescriptionRow[];
        }),
      supabase
        .from("medical_records")
        .select("id, created_at, title, content")
        .eq("patient_id", patientId)
        .eq("type", "prescription")
        .order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (error) throw error;
          return (data ?? []) as LegacyPrescriptionRow[];
        }),
    ]);

    const eligiblePrescription = pickEligibleNeuroPrescription(
      corePrescriptionRows,
      legacyPrescriptionRows,
    );

    if (!eligiblePrescription) {
      logger.info(
        "[evaluateNeuroStability] Skipping neuro scoring without active eligible prescription",
        {
          patientId,
          anamnesisId,
        },
      );
      return null;
    }

    // 1. Fetch latest extraction
    const extractionRepo = createAnamnesisExtractionAdapter(supabase);
    const extraction = await extractionRepo.getLatest(anamnesisId);

    if (!extraction) {
      logger.warn("[evaluateNeuroStability] No extraction found for anamnesis", { anamnesisId });
      return null;
    }

    // 2. Fetch latest vitals
    const { data: vitals, error: vitalsError } = await supabase
      .from("vital_signs")
      .select("*")
      .eq("patient_id", patientId)
      .order("measured_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (vitalsError) {
      logger.error("[evaluateNeuroStability] Failed to fetch vitals", vitalsError);
    }

    // 3. Prepare data for Scoring Engine
    const extractionResult = (extraction.extraction_result || {}) as {
      safetyFlags?: string[];
      normalizedOpenFields?: {
        vitals?: { bloodPressure?: string; heartRate?: number; weightKg?: number };
      };
      qualityAlerts?: Array<{ severity: number }>;
    };
    const safetyFlags = extractionResult.safetyFlags || [];

    // Extraction vitals (from AI)
    const extVitals = extractionResult.normalizedOpenFields?.vitals;

    const scoringData = {
      vitals: {
        bloodPressure:
          (vitals
            ? `${vitals.blood_pressure_systolic}/${vitals.blood_pressure_diastolic}`
            : extVitals?.bloodPressure) || null,
        heartRate: vitals?.heart_rate ?? extVitals?.heartRate,
        weight: vitals?.weight ?? extVitals?.weightKg,
      },
      sideEffects: extractionResult.qualityAlerts || [],
      redFlags: {
        suicidalIdeation: safetyFlags.some((f: string) => f.toLowerCase().includes("suicid")),
        doseEscalation: safetyFlags.some(
          (f: string) => f.toLowerCase().includes("dosis") || f.toLowerCase().includes("abuso"),
        ),
      },
    };

    // 4. Compute Score
    const result = NeuroScoringEngine.compute(scoringData);
    const reportContent = {
      ...result,
      prescription_snapshot: {
        ...eligiblePrescription,
      },
      vitals_snapshot: scoringData.vitals,
      extraction_id: extraction.id,
      computed_at: new Date().toISOString(),
    } as Database["public"]["Tables"]["medical_records"]["Insert"]["content"];

    // 5. Persist as Stability Report (Capa 4 - The Evidence)
    const { error: recordError } = await supabase.from("medical_records").insert({
      patient_id: patientId,
      title: `Stability Report - Neuro - ${result.score}`,
      type: "neuro_stability_report",
      content: reportContent,
      date_recorded: new Date().toISOString(),
      visibility: "doctor",
    });

    if (recordError) {
      logger.error("[evaluateNeuroStability] Failed to save stability report", recordError);
    }

    logger.info("[evaluateNeuroStability] Stability evaluation completed", {
      patientId,
      medication: eligiblePrescription.medication_name,
      score: result.score,
      reasonsCount: result.reasons.length,
    });

    return result;
  } catch (err) {
    logger.error("[evaluateNeuroStability] Unexpected error", err);
    return null;
  }
}

export const __testables = {
  isClinicallyActive,
  mapCoreRowToEligiblePrescription,
  mapLegacyRowToEligiblePrescription,
  pickEligibleNeuroPrescription,
};
