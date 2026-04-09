/**
 * Backend Service: medical history aggregation and mutation logic.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@autamedica/types";
import { logger } from "@autamedica/shared";
import {
  createMedicalHistoryAdapter,
  type MedicalRecord,
} from "@/lib/patients/lib/repos/medical-history.adapter";
import {
  buildStrictPrescriptionArtifactWarning,
  requiresStrictPrescriptionValidation,
} from "@/lib/prescriptions/strict-validation";

type Db = SupabaseClient<Database>;
type CorePrescriptionRow = Pick<
  Database["public"]["Tables"]["prescriptions"]["Row"],
  | "id"
  | "created_at"
  | "updated_at"
  | "doctor_id"
  | "patient_id"
  | "cuir"
  | "status"
  | "clinical_data"
  | "vendor_name"
  | "vendor_id"
  | "qr_code_content"
  | "signed_pdf_url"
>;

interface DoctorLookupRow {
  id: string;
  specialty: string | null;
  profile: {
    first_name: string | null;
    last_name: string | null;
  } | null;
}

export interface MedicalHistorySnapshot {
  prescriptions: MedicalRecord[];
  summary: {
    medications: MedicalRecord[];
    conditions: MedicalRecord[];
    allergies: MedicalRecord[];
  };
  timeline: MedicalRecord[];
  anamnesis: unknown[];
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeVendorName(value: string | null): string | null {
  if (!value || value === "pending") return null;
  return value;
}

function buildDoctorDisplayName(doctor: DoctorLookupRow | null | undefined): string | null {
  if (!doctor) return null;

  const fullName = [doctor.profile?.first_name, doctor.profile?.last_name]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ")
    .trim();

  return fullName || null;
}

function getPrimaryPrescriptionItem(
  clinicalData: Record<string, unknown>,
): Record<string, unknown> {
  const items = clinicalData.items;
  if (!Array.isArray(items)) return {};

  const firstItem = items.find((item) => item && typeof item === "object" && !Array.isArray(item));
  return firstItem && typeof firstItem === "object" && !Array.isArray(firstItem)
    ? (firstItem as Record<string, unknown>)
    : {};
}

function buildMedicationName(
  clinicalData: Record<string, unknown>,
  item: Record<string, unknown>,
): string {
  return (
    asString(item.commercialName) ??
    asString(item.genericName) ??
    asString(clinicalData.medication_name) ??
    "Prescripcion medica"
  );
}

function normalizeCorePrescription(
  prescription: CorePrescriptionRow,
  doctorMap: Map<string, DoctorLookupRow>,
): MedicalRecord {
  const clinicalData = asObject(prescription.clinical_data);
  const primaryItem = getPrimaryPrescriptionItem(clinicalData);
  const medicationName = buildMedicationName(clinicalData, primaryItem);
  const doctor = doctorMap.get(prescription.doctor_id);
  const doctorName = buildDoctorDisplayName(doctor);
  const digitalArtifactReady = Boolean(
    prescription.cuir && (prescription.qr_code_content || prescription.signed_pdf_url),
  );
  const strictValidation = requiresStrictPrescriptionValidation(medicationName);
  const artifactWarning = buildStrictPrescriptionArtifactWarning(
    medicationName,
    digitalArtifactReady,
  );

  return {
    id: prescription.id,
    patient_id: prescription.patient_id,
    type: "prescription",
    title: `Prescripcion: ${medicationName}`,
    content: {
      medication_name: medicationName,
      dosage: asString(primaryItem.dosage) ?? "",
      frequency: asString(clinicalData.frequency) ?? "",
      duration: asString(clinicalData.duration) ?? "",
      instructions: asString(primaryItem.instructions) ?? "",
      diagnosis: asString(clinicalData.diagnosis),
      notes: asString(clinicalData.notes),
      status:
        asString(clinicalData.clinical_status) ??
        asString(clinicalData.status) ??
        prescription.status,
      issuance_status: prescription.status,
      prescribed_date: asString(clinicalData.prescribed_date) ?? prescription.created_at,
      start_date:
        asString(clinicalData.start_date) ??
        asString(clinicalData.prescribed_date) ??
        prescription.created_at,
      end_date: asString(clinicalData.end_date) ?? asString(clinicalData.expiresAt),
      doctor_name: doctorName,
      prescriber_specialty: doctor?.specialty ?? null,
      cuir: prescription.cuir,
      vendor_name: normalizeVendorName(prescription.vendor_name),
      vendor_id: prescription.vendor_id,
      qr_code_content: prescription.qr_code_content,
      signed_pdf_url: prescription.signed_pdf_url,
      is_digital_artifact_ready: digitalArtifactReady,
      artifact_warning: artifactWarning,
      requires_strict_validation: strictValidation,
      source: "prescriptions_core",
    },
    created_at: prescription.created_at,
    updated_at: prescription.updated_at,
  };
}

async function listReadModelPrescriptions(
  supabase: Db,
  patientId: string,
): Promise<MedicalRecord[]> {
  const { data: rows, error } = await supabase
    .from("prescriptions")
    .select(
      "id, created_at, updated_at, doctor_id, patient_id, cuir, status, clinical_data, vendor_name, vendor_id, qr_code_content, signed_pdf_url",
    )
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("[medicalHistoryService] prescriptions read model failed", error);
    return [];
  }

  const prescriptions = (rows ?? []) as CorePrescriptionRow[];
  const doctorIds = [...new Set(prescriptions.map((row) => row.doctor_id).filter(Boolean))];
  const doctorMap = new Map<string, DoctorLookupRow>();

  if (doctorIds.length > 0) {
    const { data: doctors, error: doctorsError } = await supabase
      .from("doctors")
      .select("id, specialty, profile:profiles!doctors_user_id_fkey(first_name, last_name)")
      .in("id", doctorIds);

    if (doctorsError) {
      logger.warn("[medicalHistoryService] doctor enrichment failed", doctorsError);
    } else {
      for (const doctor of (doctors ?? []) as DoctorLookupRow[]) {
        doctorMap.set(doctor.id, doctor);
      }
    }
  }

  return prescriptions.map((row) => normalizeCorePrescription(row, doctorMap));
}

function mergeTimelineRecords(
  primary: MedicalRecord[],
  secondary: MedicalRecord[],
): MedicalRecord[] {
  const byId = new Map<string, MedicalRecord>();

  for (const record of [...primary, ...secondary]) {
    if (!byId.has(record.id)) {
      byId.set(record.id, record);
    }
  }

  return [...byId.values()].sort(
    (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
  );
}

export const medicalHistoryService = {
  async getFullHistory(supabase: Db, patientId: string): Promise<MedicalHistorySnapshot> {
    const medicalHistoryRepo = createMedicalHistoryAdapter(supabase);

    const [prescriptions, medications, conditions, allergies, timeline, anamnesisRes] =
      await Promise.all([
        listReadModelPrescriptions(supabase, patientId).catch((err) => {
          logger.error("[medicalHistoryService] prescriptions failed", err);
          return [];
        }),
        medicalHistoryRepo.listByType(patientId, "prescription").catch((err) => {
          logger.error("[medicalHistoryService] medications failed", err);
          return [];
        }),
        medicalHistoryRepo.listByType(patientId, "diagnosis").catch((err) => {
          logger.error("[medicalHistoryService] conditions failed", err);
          return [];
        }),
        medicalHistoryRepo.listByType(patientId, "allergy").catch((err) => {
          logger.error("[medicalHistoryService] allergies failed", err);
          return [];
        }),
        medicalHistoryRepo.listAll(patientId).catch((err) => {
          logger.error("[medicalHistoryService] timeline failed", err);
          return [];
        }),
        supabase
          .from("anamnesis")
          .select("*")
          .eq("patient_id", patientId)
          .then(({ data, error }) => {
            if (error) logger.error("[medicalHistoryService] anamnesis failed", error);
            return data ?? [];
          }),
      ]);

    const effectiveMedications = prescriptions.length > 0 ? prescriptions : medications;

    return {
      prescriptions: effectiveMedications,
      summary: { medications: effectiveMedications, conditions, allergies },
      timeline: mergeTimelineRecords(effectiveMedications, timeline),
      anamnesis: anamnesisRes,
    };
  },

  async addAllergy(
    supabase: Db,
    patientId: string,
    name: string,
    meta: { severity?: string; reaction?: string; notes?: string },
  ): Promise<MedicalRecord> {
    const medicalHistoryRepo = createMedicalHistoryAdapter(supabase);
    return medicalHistoryRepo.insert(patientId, "allergy", name.trim(), meta);
  },

  async addMedication(
    supabase: Db,
    patientId: string,
    name: string,
    meta: { dosage?: string; frequency?: string; status?: string; notes?: string },
  ): Promise<MedicalRecord> {
    const medicalHistoryRepo = createMedicalHistoryAdapter(supabase);
    const content = { ...meta, status: meta.status || "active" };
    return medicalHistoryRepo.insert(patientId, "prescription", name.trim(), content);
  },

  async addCondition(
    supabase: Db,
    patientId: string,
    name: string,
    meta: { status?: string; diagnosed_date?: string; notes?: string },
  ): Promise<MedicalRecord> {
    const medicalHistoryRepo = createMedicalHistoryAdapter(supabase);
    return medicalHistoryRepo.insert(patientId, "diagnosis", name.trim(), meta);
  },
};
