import type { 
  PrescriptionDraft, 
  IssuedPrescription, 
  PrescriptionId,
  CUIR,
  PrescriptionStatus,
  PrescriptionAuditEvent
} from './models';

export type { PrescriptionDraft, IssuedPrescription, PrescriptionId, CUIR, PrescriptionStatus, PrescriptionAuditEvent };

export interface VendorIssuanceResult {
  cuir: CUIR;
  vendorPrescriptionId: string;
  qrCodeContent: string;
  signedPdfUrl?: string;
  issuedAt: string;
  expiresAt: string;
}

export interface IPrescriptionRepository {
  saveDraft(draft: PrescriptionDraft): Promise<PrescriptionId>;
  findById(id: PrescriptionId): Promise<IssuedPrescription | null>;
  markAsIssued(id: PrescriptionId, result: VendorIssuanceResult): Promise<IssuedPrescription>;
  updateStatus(id: PrescriptionId, status: PrescriptionStatus): Promise<void>;
  logAuditEvent(event: Omit<PrescriptionAuditEvent, 'id' | 'timestamp'>): Promise<void>;
}

export interface IPrescriptionVendor {
  submit(prescription: PrescriptionDraft): Promise<VendorIssuanceResult>;
  cancel(cuir: CUIR, reason: string): Promise<boolean>;
  checkStatus(cuir: CUIR): Promise<PrescriptionStatus>;
}

export interface IIdentityValidator {
  validateDoctor(doctorId: string): Promise<{ active: boolean; matricula: string }>;
  validatePatient(cuil: string): Promise<{ isValid: boolean; fullName: string }>;
}
