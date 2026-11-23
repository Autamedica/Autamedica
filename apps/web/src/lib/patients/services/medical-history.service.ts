/**
 * Backend Service: medical history aggregation and mutation logic.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@autamedica/types";
import { logger } from "@autamedica/shared";
import { isMedicalCertificatePubliclyVerifiable } from "@/lib/doctors/services/medical-certificate-verification";
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
  | "signature_method"
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
  certificates: Array<Record<string, unknown>>;
  orders: Array<Record<string, unknown>>;
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
      signed_pdf_url: prescription.status === "active" && prescription.signature_method === "ac_external"
        ? `/api/doctors/prescriptions/${encodeURIComponent(prescription.id)}/pdf`
        : null,
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
      "id, created_at, updated_at, doctor_id, patient_id, cuir, status, clinical_data, vendor_name, vendor_id, qr_code_content, signed_pdf_url, signature_method",
    )
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.error("[medicalHistoryService] prescriptions read model failed", error);
    return [];
  }

  const prescriptions = ((rows ?? []) as CorePrescriptionRow[]).filter((row) =>
    !(row.vendor_name?.toLowerCase() === "memed" && row.status === "draft"),
  );
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

interface NormalizedMemedDocuments {
  prescriptions: MedicalRecord[];
  certificates: Array<Record<string, unknown>>;
}

function normalizeMemedRows(rows: unknown[], admin: Db): Promise<NormalizedMemedDocuments> {
  return (async () => {
    const records = rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"));
    const doctorIds = [...new Set(records.map((row) => asString(row.doctor_id)).filter((id): id is string => Boolean(id)))];
    const doctorMap = new Map<string, string>();
    if (doctorIds.length) {
      const { data: doctors } = await admin.from("doctors")
        .select("id, user_id, specialty, profile:profiles!doctors_user_id_fkey(first_name, last_name)")
        .in("id", doctorIds);
      for (const doctor of (doctors ?? []) as DoctorLookupRow[]) {
        const name = buildDoctorDisplayName(doctor);
        if (name) doctorMap.set(doctor.id, name);
      }
    }

    const prescriptions: MedicalRecord[] = [];
    const certificates: Array<Record<string, unknown>> = [];
    for (const row of records) {
      const provider = asObject(row.provider_data);
      const digital = asObject(row.digital_link_data);
      const id = asString(row.id) ?? asString(row.memed_id) ?? crypto.randomUUID();
      const routeId = "memed-" + id;
      const doctorId = asString(row.doctor_id) ?? "";
      const createdAt = asString(row.created_at) ?? new Date().toISOString();
      const pdfUrl = asString(digital.pdf_url) ?? asString(digital.document_url);
      const providerReportedSigned = provider.provider_reported_signed === true;
      const patientDeliveryEligible = provider.patient_delivery_eligible === true
        && providerReportedSigned && Boolean(pdfUrl);
      const structuredDocuments = Array.isArray(provider.structured_documents)
        ? provider.structured_documents.filter((document) => {
            const item = asObject(document);
            return item.tipo === "custom" && item.custom_categoria === "atestado";
          })
        : [];
      const hasAtestado = provider.has_atestado === true
        || provider.document_type === "atestado" || structuredDocuments.length > 0;
      const medicationItems = Array.isArray(provider.medications)
        ? provider.medications.filter((medication) => {
            const item = asObject(medication);
            return !(item.tipo === "custom" && item.custom_categoria === "atestado");
          })
        : [];
      const medicationName = asString(provider.medication_name)
        ?? asString(provider.medicationName)
        ?? asString(provider.nome)
        ?? asString(provider.name)
        ?? asString(provider.title)
        ?? "Receita digital Memed";
      // Keep the existing patient-facing Memed prescription link working when
      // a provider PDF URL/signature is not yet reported; prefer the full PDF
      // proxy as soon as Memed reports the signature and provides that artifact.
      const prescriptionLink = [digital.url, digital.link, digital.digital_url, digital.pdf_url, digital.document_url]
        .find((value) => typeof value === "string" && /^https:\/\//i.test(value as string));
      const patientPrescriptionUrl = patientDeliveryEligible
        ? `/api/patients/prescriptions/${encodeURIComponent(routeId)}/pdf`
        : typeof prescriptionLink === "string" ? prescriptionLink : null;

      if (hasAtestado && patientDeliveryEligible) {
        const atestado = asObject(structuredDocuments[0]);
        certificates.push({
          id: routeId,
          status: "signed",
          certificate_type: "atestado",
          title: asString(atestado.nome) ?? "Atestado médico",
          created_at: createdAt,
          doctor_name: doctorMap.get(doctorId) ?? "Médico",
          signed_pdf_url: `/api/patients/prescriptions/${encodeURIComponent(routeId)}/pdf`,
          source: "memed_br",
          signature_status: "provider_reported_signed",
        });
      }

      const hasPrescriptionItems = medicationItems.length > 0 || !hasAtestado;
      if (hasPrescriptionItems && patientPrescriptionUrl) {
        prescriptions.push({
          id: routeId,
          patient_id: asString(row.patient_id) ?? "",
          type: "prescription",
          title: "Prescripcion: " + medicationName,
          content: {
            medication_name: medicationName,
            dosage: asString(provider.dosage) ?? asString(provider.dose) ?? "",
            frequency: asString(provider.frequency) ?? "",
            duration: asString(provider.duration) ?? "",
            instructions: asString(provider.instructions) ?? "",
            diagnosis: asString(provider.diagnosis),
            status: providerReportedSigned ? "signed" : asString(row.status) ?? "verified_at_provider",
            issuance_status: providerReportedSigned ? "signed" : asString(row.status) ?? "verified_at_provider",
            prescribed_date: createdAt,
            start_date: createdAt,
            doctor_name: doctorMap.get(doctorId) ?? null,
            vendor_name: "Memed BR",
            vendor_id: asString(row.memed_id),
            signed_pdf_url: patientPrescriptionUrl,
            cuir: asString(provider.cuir) ?? asString(row.memed_id),
            is_digital_artifact_ready: Boolean(patientPrescriptionUrl),
            source: "memed_br",
          },
          created_at: createdAt,
          updated_at: createdAt,
        } satisfies MedicalRecord);
      }
    }
    return { prescriptions, certificates };
  })();
}

async function listMemedDocuments(
  admin: Db,
  authenticatedClient: SupabaseClient,
): Promise<NormalizedMemedDocuments> {
  const empty: NormalizedMemedDocuments = { prescriptions: [], certificates: [] };
  const scoped = authenticatedClient as unknown as {
    rpc: (name: string) => Promise<{ data: unknown[] | null; error: { message?: string } | null }>;
  };
  if (typeof scoped.rpc !== "function") return empty;
  const { data, error } = await scoped.rpc("patient_memed_prescriptions_get");
  if (error) {
    logger.warn("[medicalHistoryService] patient Memed RPC failed", { message: error.message });
    return empty;
  }
  return normalizeMemedRows(data ?? [], admin);
}

/**
 * Patient histories must use the same evidence gate as the certificate PDF
 * endpoint and the patient's direct RLS read policy.
 */
export function isPatientCertificateDownloadable(row: Record<string, unknown>): boolean {
  return isMedicalCertificatePubliclyVerifiable(row as {
    status: string;
    signed_pdf_url: string | null;
    signature_verified_at: string | null;
    signature_hash: string | null;
    signature_method: string | null;
  });
}

async function listPatientCertificatesAndOrders(
  supabase: Db,
  patientId: string,
): Promise<{ certificates: Array<Record<string, unknown>>; orders: Array<Record<string, unknown>> }> {
  const loose = supabase as unknown as SupabaseClient;
  const [certificatesResult, ordersResult] = await Promise.all([
    loose.from("medical_certificates")
      .select("id,doctor_id,patient_id,cuir,status,certificate_type,days_of_rest,start_date,end_date,diagnosis,observations,qr_code_content,signed_pdf_url,country_code,created_at,updated_at,signature_hash,signature_method,signature_verified_at")
      .eq("patient_id", patientId)
      .eq("status", "signed")
      .not("signed_pdf_url", "is", null)
      .not("signature_verified_at", "is", null)
      .not("signature_hash", "is", null)
      .in("signature_method", ["ac_external", "electronic_verified"])
      .order("created_at", { ascending: false }),
    loose.from("medical_orders")
      .select("id,doctor_id,patient_id,appointment_id,study_type,practices,diagnosis,notes,status,cuir,qr_code_content,signed_pdf_url,created_at,updated_at")
      .eq("patient_id", patientId).order("created_at", { ascending: false }),
  ]);
  if (certificatesResult.error) logger.warn("[medicalHistoryService] certificates query failed", { code: certificatesResult.error.code });
  if (ordersResult.error) logger.warn("[medicalHistoryService] orders query failed", { code: ordersResult.error.code });
  return {
    certificates: ((certificatesResult.data ?? []) as Array<Record<string, unknown>>)
      .filter(isPatientCertificateDownloadable),
    orders: (ordersResult.data ?? []) as Array<Record<string, unknown>>,
  };
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
  async getFullHistory(supabase: Db, patientId: string, authenticatedClient: SupabaseClient = supabase): Promise<MedicalHistorySnapshot> {
    const medicalHistoryRepo = createMedicalHistoryAdapter(supabase);

    const [corePrescriptions, memedDocuments, medications, conditions, allergies, timeline, clinicalDocuments, anamnesisRes] =
      await Promise.all([
        listReadModelPrescriptions(supabase, patientId).catch((err) => {
          logger.error("[medicalHistoryService] prescriptions failed", err);
          return [];
        }),
        listMemedDocuments(supabase, authenticatedClient).catch((err) => {
          logger.error("[medicalHistoryService] Memed documents failed", err);
          return { prescriptions: [], certificates: [] };
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
        listPatientCertificatesAndOrders(supabase, patientId).catch((err) => {
          logger.error("[medicalHistoryService] clinical documents failed", err);
          return { certificates: [], orders: [] };
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

    const coreRecords = corePrescriptions ?? [];
    const memedIds = new Set(coreRecords.map((record) => asString(asObject(record.content).vendor_id)).filter((value): value is string => Boolean(value)));
    const coreIds = new Set(coreRecords.map((record) => record.id));
    const uniqueMemed = memedDocuments.prescriptions.filter((record) => {
      const vendorId = asString(asObject(record.content).vendor_id);
      const sourceId = record.id.replace(/^memed-/, "");
      return (!vendorId || !memedIds.has(vendorId)) && !coreIds.has(sourceId);
    });
    const prescriptions = [...coreRecords, ...uniqueMemed].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const effectiveMedications = prescriptions.length > 0 ? prescriptions : medications;

    return {
      prescriptions: effectiveMedications,
      certificates: [...clinicalDocuments.certificates, ...memedDocuments.certificates],
      orders: clinicalDocuments.orders,
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
