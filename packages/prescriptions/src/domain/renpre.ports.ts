import type { DoctorId } from '@autamedica/types';

export type RenpreStatus = 'pending' | 'verified' | 'expired' | 'rejected';

export interface RenpreRegistration {
  doctorId: DoctorId;
  renpreNumber: string;
  certificatePdfUrl?: string;
  validFrom: string;
  validUntil: string;
  status: RenpreStatus;
  verifiedAt?: string;
  verifiedByAdminId?: string;
  rejectionReason?: string;
}

export interface RenpreUploadInput {
  doctorId: DoctorId;
  renpreNumber: string;
  validFrom: string;
  validUntil: string;
  certificatePdfUrl?: string;
}

export interface IRenpreValidator {
  isVerified(doctorId: DoctorId): Promise<boolean>;
  get(doctorId: DoctorId): Promise<RenpreRegistration | null>;
  upsert(input: RenpreUploadInput): Promise<RenpreRegistration>;
  markVerified(doctorId: DoctorId, adminId: string): Promise<void>;
  markRejected(doctorId: DoctorId, adminId: string, reason: string): Promise<void>;
}
