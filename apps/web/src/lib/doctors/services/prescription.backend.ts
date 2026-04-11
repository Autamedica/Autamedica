import {
  createMedicalRecordsAdapter,
  type MedicalRecordUpdate,
  type UiMedicalRecord,
} from "@/lib/doctors/lib/repos/medical-records";
import { doctorHasPatientAccess } from "@/lib/doctors/lib/resolve-room";
import type { DoctorContext } from "@/lib/doctors/api/doctor-context";
import {
  buildStrictPrescriptionArtifactWarning,
  requiresStrictPrescriptionValidation,
} from "@/lib/prescriptions/strict-validation";
import type {
  Prescription,
  PrescriptionFilters,
  PrescriptionStatus,
  UUID,
} from "@/lib/doctors/types/medical";
import type { Database } from "@autamedica/types";
import { logger } from "@autamedica/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient<Database>;
type CorePrescriptionStatus = Database["public"]["Tables"]["prescriptions"]["Row"]["status"];
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

const DOCTOR_PRESCRIPTION_SELECT = [
  "id",
  "created_at",
  "updated_at",
  "doctor_id",
  "patient_id",
  "cuir",
  "status",
  "clinical_data",
  "vendor_name",
  "vendor_id",
  "qr_code_content",
  "signed_pdf_url",
].join(", ");

interface PrescriptionContent {
  medication_name?: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  status?: PrescriptionStatus;
  clinical_status?: PrescriptionStatus;
  prescribed_date?: string;
  start_date?: string;
  end_date?: string | null;
  notes?: string | null;
  diagnosis?: string | null;
  side_effects_warning?: string | null;
  medications?: Array<{
    name?: string;
    dosage?: string;
    frequency?: string;
    duration?: string;
    instructions?: string;
  }>;
  [key: string]: unknown;
}

interface LegacyPrescriptionRow {
  id: string;
  patient_id: string | null;
  doctor_id: string | null;
  title: string;
  content: unknown;
  date_recorded: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface DoctorPrescriptionWritePayload {
  patient_id: UUID;
  medication_name: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  status?: PrescriptionStatus;
  prescribed_date?: string;
  start_date?: string;
  end_date?: string | null;
  notes?: string | null;
  diagnosis?: string | null;
  side_effects_warning?: string | null;
}

function getPrescriptionContent(content: unknown): PrescriptionContent {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    return content as PrescriptionContent;
  }
  return {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeVendorName(value: string | null): string | null {
  if (!value || value === "pending") return null;
  return value;
}

function deriveLegacyStatus(
  content: PrescriptionContent,
  fallbackDate: string,
): PrescriptionStatus {
  if (
    content.status &&
    (["activa", "completada", "cancelada", "pausada"] as PrescriptionStatus[]).includes(
      content.status,
    )
  ) {
    return content.status;
  }

  if (content.end_date) {
    return new Date(content.end_date) < new Date() ? "completada" : "activa";
  }

  return fallbackDate ? "activa" : "pausada";
}

function normalizeDoctorPrescriptionStatus(
  content: PrescriptionContent,
  issuanceStatus: CorePrescriptionStatus,
  fallbackDate: string,
): PrescriptionStatus {
  const explicitStatus = content.clinical_status ?? content.status;
  if (
    explicitStatus &&
    (["activa", "completada", "cancelada", "pausada"] as PrescriptionStatus[]).includes(
      explicitStatus,
    )
  ) {
    return explicitStatus;
  }

  if (issuanceStatus === "cancelled") return "cancelada";
  if (issuanceStatus === "expired" || issuanceStatus === "dispensed_total") return "completada";
  if (content.end_date) {
    return new Date(content.end_date) < new Date() ? "completada" : "activa";
  }

  return fallbackDate ? "activa" : "pausada";
}

function mapLegacyRecordToPrescription(record: UiMedicalRecord): Prescription {
  const content = getPrescriptionContent(record.content);
  const primaryMedication = content.medications?.[0];
  const prescribedDate =
    content.prescribed_date ||
    content.start_date ||
    record.dateRecorded ||
    record.createdAt ||
    new Date().toISOString();
  const startDate = content.start_date || prescribedDate;
  const medicationName =
    content.medication_name ||
    primaryMedication?.name ||
    record.title.replace(/^Prescripci[oó]n:\s*/i, "") ||
    "Prescripción médica";
  const requiresStrictValidation = requiresStrictPrescriptionValidation(medicationName);
  const artifactWarning = buildStrictPrescriptionArtifactWarning(medicationName, false);

  return {
    id: record.id as UUID,
    patient_id: (record.patientId ?? "") as UUID,
    doctor_id: (record.doctorId ?? "") as UUID,
    medical_record_id: record.id as UUID,
    medication_name: medicationName,
    dosage: content.dosage || primaryMedication?.dosage || "",
    frequency: content.frequency || primaryMedication?.frequency || "",
    duration: content.duration || primaryMedication?.duration || "",
    instructions: content.instructions || primaryMedication?.instructions || "",
    diagnosis: asString(content.diagnosis),
    status: deriveLegacyStatus(content, prescribedDate),
    prescribed_date: prescribedDate,
    start_date: startDate,
    end_date: content.end_date ?? null,
    notes: content.notes ?? null,
    side_effects_warning: content.side_effects_warning ?? null,
    source: "legacy",
    issuance_status: null,
    vendor_name: null,
    vendor_id: null,
    cuir: null,
    signed_pdf_url: null,
    is_digital_artifact_ready: false,
    artifact_warning: artifactWarning,
    requires_strict_validation: requiresStrictValidation,
    created_at: record.createdAt || prescribedDate,
    updated_at: record.updatedAt || record.createdAt || prescribedDate,
  };
}

function normalizeLegacyRow(row: LegacyPrescriptionRow): UiMedicalRecord {
  return {
    id: row.id,
    patientId: row.patient_id,
    doctorId: row.doctor_id,
    title: row.title,
    type: "prescription",
    content: row.content,
    visibility: "patient",
    dateRecorded: row.date_recorded,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapClinicalStatusToCoreStatus(
  status: PrescriptionStatus,
  currentStatus?: CorePrescriptionStatus,
): CorePrescriptionStatus {
  if (status === "cancelada") return "cancelled";
  if (status === "completada") {
    if (
      currentStatus === "sent" ||
      currentStatus === "dispensed_partial" ||
      currentStatus === "dispensed_total"
    ) {
      return currentStatus;
    }
    return "expired";
  }
  if (
    currentStatus === "sent" ||
    currentStatus === "dispensed_partial" ||
    currentStatus === "dispensed_total"
  ) {
    return currentStatus;
  }
  return currentStatus === "signed" ? "signed" : "draft";
}

export function mapCoreRowToPrescription(row: CorePrescriptionRow): Prescription {
  const content = getPrescriptionContent(row.clinical_data);
  const primaryMedication = content.medications?.[0];
  const prescribedDate = content.prescribed_date || content.start_date || row.created_at;
  const startDate = content.start_date || prescribedDate;
  const medicationName =
    content.medication_name || primaryMedication?.name || "Prescripción médica";
  const digitalArtifactReady = Boolean(row.cuir && (row.qr_code_content || row.signed_pdf_url));
  const requiresStrictValidation = requiresStrictPrescriptionValidation(medicationName);
  const artifactWarning = buildStrictPrescriptionArtifactWarning(
    medicationName,
    digitalArtifactReady,
  );

  return {
    id: row.id as UUID,
    patient_id: row.patient_id as UUID,
    doctor_id: row.doctor_id as UUID,
    medical_record_id: null,
    medication_name: medicationName,
    dosage: content.dosage || primaryMedication?.dosage || "",
    frequency: content.frequency || primaryMedication?.frequency || "",
    duration: content.duration || primaryMedication?.duration || "",
    instructions: content.instructions || primaryMedication?.instructions || "",
    diagnosis: asString(content.diagnosis),
    status: normalizeDoctorPrescriptionStatus(content, row.status, prescribedDate),
    prescribed_date: prescribedDate,
    start_date: startDate,
    end_date: content.end_date ?? null,
    notes: content.notes ?? null,
    side_effects_warning: content.side_effects_warning ?? null,
    source: "prescriptions_core",
    issuance_status: row.status as Prescription['issuance_status'],
    vendor_name: normalizeVendorName(row.vendor_name),
    vendor_id: row.vendor_id,
    cuir: row.cuir,
    signed_pdf_url: row.signed_pdf_url,
    is_digital_artifact_ready: digitalArtifactReady,
    artifact_warning: artifactWarning,
    requires_strict_validation: requiresStrictValidation,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function assertStrictPrescriptionRequirements(
  payload: Pick<DoctorPrescriptionWritePayload, "medication_name" | "diagnosis" | "dosage">,
): void {
  if (!requiresStrictPrescriptionValidation(payload.medication_name)) {
    return;
  }

  const hasDiagnosis = Boolean(payload.diagnosis?.trim());
  const hasDosage = Boolean(payload.dosage?.trim());

  if (!hasDiagnosis || !hasDosage) {
    throw new Error("strict_prescription_missing_required_fields");
  }
}

function buildClinicalDataFromPayload(
  payload: DoctorPrescriptionWritePayload,
  current?: PrescriptionContent,
  digitalArtifactReady = false,
): Database["public"]["Tables"]["prescriptions"]["Insert"]["clinical_data"] {
  const prescribedDate =
    payload.prescribed_date ||
    payload.start_date ||
    current?.prescribed_date ||
    current?.start_date ||
    new Date().toISOString();
  const startDate = payload.start_date || current?.start_date || prescribedDate;
  const clinicalStatus = payload.status || current?.clinical_status || current?.status || "activa";
  const requiresStrictValidation = requiresStrictPrescriptionValidation(payload.medication_name);

  return {
    ...current,
    medication_name: payload.medication_name,
    dosage: payload.dosage ?? "",
    frequency: payload.frequency ?? "",
    duration: payload.duration ?? "",
    instructions: payload.instructions ?? "",
    diagnosis: payload.diagnosis ?? null,
    notes: payload.notes ?? null,
    side_effects_warning: payload.side_effects_warning ?? null,
    status: clinicalStatus,
    clinical_status: clinicalStatus,
    prescribed_date: prescribedDate,
    start_date: startDate,
    end_date: payload.end_date ?? null,
    requires_strict_validation: requiresStrictValidation,
    artifact_warning: buildStrictPrescriptionArtifactWarning(
      payload.medication_name,
      digitalArtifactReady,
    ),
    source: "doctor_portal",
  };
}

function buildLegacyRecordUpdate(payload: DoctorPrescriptionWritePayload): MedicalRecordUpdate {
  const prescribedDate = payload.prescribed_date || payload.start_date || new Date().toISOString();

  return {
    title: payload.medication_name
      ? `Prescripción: ${payload.medication_name}`
      : "Prescripción médica",
    dateRecorded: payload.start_date || prescribedDate,
    content: {
      medication_name: payload.medication_name,
      dosage: payload.dosage ?? "",
      frequency: payload.frequency ?? "",
      duration: payload.duration ?? "",
      instructions: payload.instructions ?? "",
      diagnosis: payload.diagnosis ?? null,
      notes: payload.notes ?? null,
      side_effects_warning: payload.side_effects_warning ?? null,
      status: payload.status ?? "activa",
      prescribed_date: prescribedDate,
      start_date: payload.start_date || prescribedDate,
      end_date: payload.end_date ?? null,
    },
  };
}

function applyFilters(prescriptions: Prescription[], filters: PrescriptionFilters): Prescription[] {
  let filtered = prescriptions;

  if (filters.status) {
    filtered = filtered.filter((prescription) => prescription.status === filters.status);
  }

  if (filters.medication_name) {
    const search = filters.medication_name.toLowerCase();
    filtered = filtered.filter((prescription) =>
      prescription.medication_name.toLowerCase().includes(search),
    );
  }

  if (filters.active_only) {
    const now = new Date();
    filtered = filtered.filter(
      (prescription) =>
        prescription.status === "activa" &&
        new Date(prescription.start_date) <= now &&
        (!prescription.end_date || new Date(prescription.end_date) >= now),
    );
  }

  return filtered;
}

function sortByPrescribedDateDesc(prescriptions: Prescription[]): Prescription[] {
  return [...prescriptions].sort(
    (left, right) =>
      new Date(right.prescribed_date).getTime() - new Date(left.prescribed_date).getTime(),
  );
}

export const doctorPrescriptionBackendService = {
  async listByPatient(
    supabase: Db,
    context: DoctorContext,
    patientId: UUID,
    filters: PrescriptionFilters = {},
  ): Promise<Prescription[]> {
    const canAccess = await doctorHasPatientAccess(supabase, context.doctorId, patientId);
    if (!canAccess) {
      throw new Error("forbidden_patient_access");
    }

    const [coreRows, legacyRows] = await Promise.all([
      supabase
        .from("prescriptions")
        .select(DOCTOR_PRESCRIPTION_SELECT)
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (error) throw error;
          return (data ?? []) as unknown as CorePrescriptionRow[];
        }),
      createMedicalRecordsAdapter(supabase)
        .findByPatient(patientId, "prescription")
        .catch((error) => {
          logger.warn("[doctorPrescriptionBackendService] legacy fallback failed", error);
          return [];
        }),
    ]);

    const merged = [
      ...coreRows.map(mapCoreRowToPrescription),
      ...legacyRows.map(mapLegacyRecordToPrescription),
    ];

    return applyFilters(sortByPrescribedDateDesc(merged), filters);
  },

  async create(
    supabase: Db,
    context: DoctorContext,
    payload: DoctorPrescriptionWritePayload,
  ): Promise<Prescription> {
    const canAccess = await doctorHasPatientAccess(supabase, context.doctorId, payload.patient_id);
    if (!canAccess) {
      throw new Error("forbidden_patient_access");
    }

    assertStrictPrescriptionRequirements(payload);

    const clinicalStatus = payload.status ?? "activa";
    const clinicalData = buildClinicalDataFromPayload({
      ...payload,
      status: clinicalStatus,
    });

    const { data, error } = await supabase
      .from("prescriptions")
      .insert({
        doctor_id: context.doctorId,
        patient_id: payload.patient_id,
        status: mapClinicalStatusToCoreStatus(clinicalStatus),
        vendor_name: "pending",
        clinical_data: clinicalData,
      })
      .select(DOCTOR_PRESCRIPTION_SELECT)
      .single();

    if (error) {
      logger.error("[doctorPrescriptionBackendService] create failed", {
        doctorId: context.doctorId,
        patientId: payload.patient_id,
        error,
      });
      throw error;
    }

    return mapCoreRowToPrescription(data as unknown as CorePrescriptionRow);
  },

  async update(
    supabase: Db,
    context: DoctorContext,
    prescriptionId: UUID,
    updates: Partial<DoctorPrescriptionWritePayload>,
  ): Promise<Prescription | null> {
    const { data: existing, error: existingError } = await supabase
      .from("prescriptions")
      .select(DOCTOR_PRESCRIPTION_SELECT)
      .eq("id", prescriptionId)
      .maybeSingle();

    if (existingError) {
      logger.error("[doctorPrescriptionBackendService] update fetch failed", {
        prescriptionId,
        error: existingError,
      });
      throw existingError;
    }

    if (!existing) {
      const { data: legacyRow, error: legacyError } = await supabase
        .from("medical_records")
        .select(
          "id, patient_id, doctor_id, title, type, content, visibility, date_recorded, created_at, updated_at",
        )
        .eq("id", prescriptionId)
        .eq("type", "prescription")
        .maybeSingle();

      if (legacyError) {
        logger.error("[doctorPrescriptionBackendService] legacy update fetch failed", {
          prescriptionId,
          error: legacyError,
        });
        throw legacyError;
      }

      if (!legacyRow) {
        return null;
      }

      const legacyRecord = normalizeLegacyRow(legacyRow as LegacyPrescriptionRow);
      const legacyPatientId = (legacyRecord.patientId ?? "") as UUID;
      const canAccessLegacy = await doctorHasPatientAccess(
        supabase,
        context.doctorId,
        legacyPatientId,
      );
      if (!canAccessLegacy) {
        throw new Error("forbidden_patient_access");
      }

      if (legacyRecord.doctorId && legacyRecord.doctorId !== context.doctorId) {
        throw new Error("forbidden_prescription_update");
      }

      const currentLegacyPrescription = mapLegacyRecordToPrescription(legacyRecord);
      const mergedLegacyPayload: DoctorPrescriptionWritePayload = {
        patient_id: currentLegacyPrescription.patient_id,
        medication_name: updates.medication_name ?? currentLegacyPrescription.medication_name,
        dosage: updates.dosage ?? currentLegacyPrescription.dosage,
        frequency: updates.frequency ?? currentLegacyPrescription.frequency,
        duration: updates.duration ?? currentLegacyPrescription.duration,
        instructions: updates.instructions ?? currentLegacyPrescription.instructions,
        status: updates.status ?? currentLegacyPrescription.status,
        prescribed_date: updates.prescribed_date ?? currentLegacyPrescription.prescribed_date,
        start_date: updates.start_date ?? currentLegacyPrescription.start_date,
        end_date: updates.end_date ?? currentLegacyPrescription.end_date,
        notes: updates.notes ?? currentLegacyPrescription.notes,
        diagnosis: updates.diagnosis ?? currentLegacyPrescription.diagnosis ?? null,
        side_effects_warning:
          updates.side_effects_warning ?? currentLegacyPrescription.side_effects_warning,
      };

      assertStrictPrescriptionRequirements(mergedLegacyPayload);

      await createMedicalRecordsAdapter(supabase).update(
        prescriptionId,
        buildLegacyRecordUpdate(mergedLegacyPayload),
      );

      return {
        ...currentLegacyPrescription,
        ...mergedLegacyPayload,
        source: "legacy",
        updated_at: new Date().toISOString(),
      };
    }

    const existingRow = existing as unknown as CorePrescriptionRow;
    const canAccess = await doctorHasPatientAccess(
      supabase,
      context.doctorId,
      existingRow.patient_id,
    );
    if (!canAccess) {
      throw new Error("forbidden_patient_access");
    }

    if (existingRow.doctor_id !== context.doctorId) {
      throw new Error("forbidden_prescription_update");
    }

    const currentContent = getPrescriptionContent(existingRow.clinical_data);
    const currentPrescription = mapCoreRowToPrescription(existingRow);
    const mergedPayload: DoctorPrescriptionWritePayload = {
      patient_id: currentPrescription.patient_id,
      medication_name: updates.medication_name ?? currentPrescription.medication_name,
      dosage: updates.dosage ?? currentPrescription.dosage,
      frequency: updates.frequency ?? currentPrescription.frequency,
      duration: updates.duration ?? currentPrescription.duration,
      instructions: updates.instructions ?? currentPrescription.instructions,
      status: updates.status ?? currentPrescription.status,
      prescribed_date: updates.prescribed_date ?? currentPrescription.prescribed_date,
      start_date: updates.start_date ?? currentPrescription.start_date,
      end_date: updates.end_date ?? currentPrescription.end_date,
      notes: updates.notes ?? currentPrescription.notes,
      diagnosis: updates.diagnosis ?? currentPrescription.diagnosis ?? null,
      side_effects_warning:
        updates.side_effects_warning ?? currentPrescription.side_effects_warning,
    };

    assertStrictPrescriptionRequirements(mergedPayload);

    const clinicalData = buildClinicalDataFromPayload(
      mergedPayload,
      currentContent,
      Boolean(existingRow.cuir && (existingRow.qr_code_content || existingRow.signed_pdf_url)),
    );
    const nextCoreStatus = mapClinicalStatusToCoreStatus(
      mergedPayload.status ?? currentPrescription.status,
      existingRow.status,
    );

    const { data, error } = await supabase
      .from("prescriptions")
      .update({
        status: nextCoreStatus,
        clinical_data: clinicalData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", prescriptionId)
      .select(DOCTOR_PRESCRIPTION_SELECT)
      .single();

    if (error) {
      logger.error("[doctorPrescriptionBackendService] update failed", { prescriptionId, error });
      throw error;
    }

    return mapCoreRowToPrescription(data as unknown as CorePrescriptionRow);
  },
};

export const __testables = {
  applyFilters,
  mapCoreRowToPrescription,
  mapClinicalStatusToCoreStatus,
  assertStrictPrescriptionRequirements,
};
