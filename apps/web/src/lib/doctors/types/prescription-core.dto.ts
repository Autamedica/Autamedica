import type { Prescription, PrescriptionStatus } from './medical';
import type {
  IssuedPrescription,
  PrescriptionStatus as CoreStatus,
  PrescriptionItem,
  PrescriptionArtifacts,
  PrescriberIdentity,
  PatientIdentity,
} from '@autamedica/prescriptions';
import type {
  PrescriptionId,
  DoctorId,
  PatientId,
  OrganizationId,
  ISODateString,
} from '@autamedica/types';

/**
 * Maps a legacy Prescription (from prescription.backend service) to the
 * core IssuedPrescription model from @autamedica/prescriptions.
 *
 * Not all legacy prescriptions have full issuance data; missing fields
 * are filled with sensible defaults so the type contract holds.
 */
export function mapLegacyToCore(legacy: Prescription): IssuedPrescription {
  const item: PrescriptionItem = {
    genericName: legacy.medication_name,
    dosage: legacy.dosage,
    presentation: legacy.frequency,
    quantity: 1,
    instructions: legacy.instructions,
  };

  const artifacts: PrescriptionArtifacts = {
    cuir: legacy.cuir ?? '',
    qrCodeContent: legacy.cuir ? `https://www.autamedica.com/verify/${legacy.cuir}` : '',
    signedPdfUrl: legacy.signed_pdf_url ?? undefined,
  };

  const prescriber: PrescriberIdentity = {
    doctorId: legacy.doctor_id as unknown as DoctorId,
    matriculaNumber: '',
    matriculaType: 'MN',
    fullName: '',
  };

  const patient: PatientIdentity = {
    patientId: legacy.patient_id as unknown as PatientId,
    cuil: '',
    dni: '' as never,
    fullName: '',
  };

  return {
    id: legacy.id as unknown as PrescriptionId,
    patient,
    prescriber,
    organizationId: '' as unknown as OrganizationId,
    items: [item],
    type: 'medication',
    diagnosisCie10: legacy.diagnosis ?? undefined,
    notes: legacy.notes ?? undefined,
    cuir: legacy.cuir ?? '',
    status: mapLegacyStatusToCore(legacy.issuance_status ?? null, legacy.status),
    issuedAt: legacy.prescribed_date as unknown as ISODateString,
    expiresAt: (legacy.end_date ?? '') as unknown as ISODateString,
    artifacts,
    vendorName: legacy.vendor_name ?? '',
    vendorPrescriptionId: legacy.vendor_id ?? '',
  };
}

function mapLegacyStatusToCore(
  issuanceStatus: string | null | undefined,
  clinicalStatus: PrescriptionStatus,
): CoreStatus {
  if (issuanceStatus === 'sent') return 'sent';
  if (issuanceStatus === 'signed') return 'signed';
  if (issuanceStatus === 'dispensed_partial') return 'dispensed_partial';
  if (issuanceStatus === 'dispensed_total') return 'dispensed_total';
  if (issuanceStatus === 'cancelled') return 'cancelled';
  if (issuanceStatus === 'expired') return 'expired';
  if (issuanceStatus === 'draft') return 'draft';

  if (clinicalStatus === 'cancelada') return 'cancelled';
  if (clinicalStatus === 'completada') return 'expired';
  return 'draft';
}

/**
 * DTO returned to patients. Strips internal doctor/system data
 * and exposes only what is relevant for the patient view.
 */
export interface PatientPrescriptionDTO {
  id: string;
  medicationName: string;
  dosage: string;
  frequency: string;
  instructions: string;
  status: string;
  cuir: string | null;
  signedPdfUrl: string | null;
  prescribedDate: string;
  expiresAt: string | null;
  doctorName: string;
  isDigitalReady: boolean;
}

/**
 * Maps an IssuedPrescription (core) to a patient-safe DTO.
 * Receives doctorName separately since it is not part of the core model
 * in a user-friendly format.
 */
export function mapCoreToPatientDTO(
  core: IssuedPrescription,
  doctorName: string,
): PatientPrescriptionDTO {
  const primaryItem = core.items[0];

  return {
    id: core.id as string,
    medicationName: primaryItem?.genericName ?? '',
    dosage: primaryItem?.dosage ?? '',
    frequency: primaryItem?.presentation ?? '',
    instructions: primaryItem?.instructions ?? '',
    status: core.status,
    cuir: core.cuir || null,
    signedPdfUrl: core.artifacts.signedPdfUrl ?? null,
    prescribedDate: core.issuedAt,
    expiresAt: core.expiresAt || null,
    doctorName,
    isDigitalReady: Boolean(core.cuir && (core.artifacts.qrCodeContent || core.artifacts.signedPdfUrl)),
  };
}
