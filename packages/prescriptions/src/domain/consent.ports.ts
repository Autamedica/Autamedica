import type { PatientId } from '@autamedica/types';

export type ConsentType =
  | 'general'
  | 'psychiatry_controlled'
  | 'telemedicine'
  | 'data_sharing_insurance'
  | 'data_sharing_anmat';

export interface InformedConsent {
  id: string;
  patientId: PatientId;
  consentType: ConsentType;
  templateVersion: string;
  pdfUrl?: string;
  signedAt: string;
  ipAddress?: string;
  userAgent?: string;
  signatureHash: string;
  acceptedSections: string[];
  revokedAt?: string;
  expiresAt?: string;
}

export interface ConsentSignInput {
  patientId: PatientId;
  consentType: ConsentType;
  templateVersion: string;
  acceptedSections: string[];
  ipAddress?: string;
  userAgent?: string;
  pdfUrl?: string;
}

export interface IConsentRepository {
  getLatestActive(patientId: PatientId, type: ConsentType): Promise<InformedConsent | null>;
  isActive(patientId: PatientId, type: ConsentType): Promise<boolean>;
  sign(input: ConsentSignInput): Promise<InformedConsent>;
  revoke(consentId: string, reason: string): Promise<void>;
}
