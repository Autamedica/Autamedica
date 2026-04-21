import type { PrescriptionId } from '@autamedica/types';

export type InsuranceProvider =
  | 'osde'
  | 'swiss_medical'
  | 'medife'
  | 'galeno'
  | 'accord'
  | 'pami'
  | 'omint'
  | 'sancor_salud'
  | 'prepaga_otra'
  | 'particular';

export type AuthorizationStatus =
  | 'requested'
  | 'approved'
  | 'denied'
  | 'pending_review'
  | 'expired'
  | 'cancelled';

export interface AuthorizationRequest {
  prescriptionId: PrescriptionId;
  insuranceProvider: InsuranceProvider;
  memberNumber: string;
  planCode?: string;
  drugs: Array<{ genericName: string; commercialName?: string; quantity: number; unitPriceArs?: number }>;
  diagnosisCie10?: string;
  patientDni: string;
  patientFullName: string;
  prescriberMatricula: string;
}

export interface AuthorizationResult {
  status: AuthorizationStatus;
  authorizationNumber?: string;
  coveragePct?: number;
  approvedAmountArs?: number;
  outOfPocketArs?: number;
  denialReason?: string;
  expiresAt?: string;
  rawResponse?: Record<string, unknown>;
}

export interface IInsuranceAuthorizationService {
  readonly provider: InsuranceProvider;
  requestAuthorization(request: AuthorizationRequest): Promise<AuthorizationResult>;
  checkStatus(authorizationNumber: string): Promise<AuthorizationResult>;
  cancel(authorizationNumber: string): Promise<void>;
}

export interface IInsuranceAuthorizationRouter {
  dispatch(request: AuthorizationRequest): Promise<AuthorizationResult>;
}
