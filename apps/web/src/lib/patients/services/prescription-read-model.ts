import {
  buildStrictPrescriptionArtifactWarning,
  requiresStrictPrescriptionValidation,
} from "@/lib/prescriptions/strict-validation";
import type { PatientPrescription } from "@/lib/patients/types/medical-history";

export { requiresStrictPrescriptionValidation } from "@/lib/prescriptions/strict-validation";

interface RawPrescriptionRecord {
  id: unknown;
  title: unknown;
  content: unknown;
  created_at: unknown;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function getMedicationName(
  record: RawPrescriptionRecord,
  content: Record<string, unknown>,
): string {
  const fromContent = asString(content.medication_name);
  if (fromContent) return fromContent;

  const fromTitle = String(record.title ?? "")
    .replace(/^Prescripci[oó]n:\s*/i, "")
    .trim();

  return fromTitle || "Prescripcion medica";
}

export function mapPrescriptionRecordToPatientPrescription(
  record: RawPrescriptionRecord,
): PatientPrescription {
  const content = asObject(record.content);
  const fallbackDate = asString(record.created_at) ?? new Date().toISOString();
  const medicationName = getMedicationName(record, content);
  const strictValidation = requiresStrictPrescriptionValidation(medicationName);
  const signedPdfUrl = asString(content.signed_pdf_url);
  const qrCodeContent = asString(content.qr_code_content);
  const cuir = asString(content.cuir);
  const digitalArtifactReady =
    asBoolean(content.is_digital_artifact_ready) ??
    Boolean(cuir && (qrCodeContent || signedPdfUrl));

  return {
    id: String(record.id ?? ""),
    medication_name: medicationName,
    dosage: asString(content.dosage) ?? "",
    frequency: asString(content.frequency) ?? "",
    duration: asString(content.duration) ?? "",
    instructions: asString(content.instructions) ?? "",
    diagnosis: asString(content.diagnosis),
    doctor_name: asString(content.doctor_name),
    prescriber_specialty: asString(content.prescriber_specialty),
    notes: asString(content.notes),
    status: asString(content.status) ?? "activa",
    prescribed_date: asString(content.prescribed_date) ?? fallbackDate,
    start_date: asString(content.start_date) ?? fallbackDate,
    end_date: asString(content.end_date),
    side_effects_warning: asString(content.side_effects_warning),
    cuir,
    vendor_name: asString(content.vendor_name),
    vendor_id: asString(content.vendor_id),
    qr_code_content: qrCodeContent,
    signed_pdf_url: signedPdfUrl,
    artifact_warning:
      asString(content.artifact_warning) ??
      buildStrictPrescriptionArtifactWarning(medicationName, digitalArtifactReady),
    is_digital_artifact_ready: digitalArtifactReady,
    requires_strict_validation: strictValidation,
    source: asString(content.source) === "prescriptions_core" ? "prescriptions_core" : "legacy",
  };
}

export function buildPatientPrescriptions(records: RawPrescriptionRecord[]): PatientPrescription[] {
  return records
    .map(mapPrescriptionRecordToPatientPrescription)
    .sort((a, b) => new Date(b.prescribed_date).getTime() - new Date(a.prescribed_date).getTime());
}
