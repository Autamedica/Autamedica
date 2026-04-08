import { z } from 'zod';
import type { 
  PatientId, 
  DoctorId, 
  AppointmentId, 
  PrescriptionId,
  ISODateString,
  DNI,
  OrganizationId
} from '@autamedica/types';

export type { PrescriptionId, PatientId, DoctorId, AppointmentId, OrganizationId, ISODateString, DNI };

export const CuilSchema = z.string().regex(/^\d{11}$/, 'CUIL debe tener 11 dígitos');
export type CUIL = z.infer<typeof CuilSchema>;
export type CUIR = string;
export type PrescriptionType = 'medication' | 'study' | 'procedure' | 'device';
export type PrescriptionStatus = 'draft' | 'signed' | 'sent' | 'dispensed_partial' | 'dispensed_total' | 'cancelled' | 'expired';

export interface PrescriberIdentity {
  doctorId: DoctorId;
  matriculaNumber: string;
  matriculaType: 'MN' | 'MP';
  matriculaProvince?: string;
  fullName: string;
  specialty?: string;
}

export interface PatientIdentity {
  patientId: PatientId;
  cuil: CUIL;
  dni: DNI;
  fullName: string;
  insuranceProvider?: string;
  insuranceMemberNumber?: string;
}

export interface PrescriptionItem {
  genericName: string;
  commercialName?: string;
  dosage: string;
  presentation: string;
  quantity: number;
  instructions: string;
  snomedCode?: string;
}

export interface PrescriptionArtifacts {
  cuir: CUIR;
  qrCodeContent: string;
  signedPdfUrl?: string;
  barcodeValue?: string;
  linkBuscadorNacional?: string;
}

export interface PrescriptionDraft {
  patient: PatientIdentity;
  prescriber: PrescriberIdentity;
  appointmentId?: AppointmentId;
  organizationId: OrganizationId;
  items: PrescriptionItem[];
  diagnosisCie10?: string;
  type: PrescriptionType;
  notes?: string;
}

export interface IssuedPrescription extends PrescriptionDraft {
  id: PrescriptionId;
  cuir: CUIR;
  status: PrescriptionStatus;
  issuedAt: ISODateString;
  expiresAt: ISODateString;
  artifacts: PrescriptionArtifacts;
  vendorName: string;
  vendorPrescriptionId: string;
}

export interface PrescriptionAuditEvent {
  id: string;
  prescriptionId: PrescriptionId;
  eventType: 'issued' | 'signed' | 'viewed' | 'dispensed' | 'cancelled';
  userId: string;
  timestamp: ISODateString;
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    signatureHash?: string;
    reason?: string;
  };
}
