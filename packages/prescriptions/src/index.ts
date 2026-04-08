export { CuilSchema } from './domain/models';
export type { 
  CUIL, CUIR, PrescriptionType, PrescriptionStatus, PrescriberIdentity, 
  PatientIdentity, PrescriptionItem, PrescriptionArtifacts, PrescriptionDraft, 
  IssuedPrescription, PrescriptionAuditEvent 
} from './domain/models';
export type { 
  IPrescriptionRepository, IPrescriptionVendor, IIdentityValidator, VendorIssuanceResult 
} from './domain/ports';
export { IssuePrescriptionUseCase } from './usecases/IssuePrescription';
export { SupabasePrescriptionRepository } from './infrastructure/adapters/SupabaseRepository';
export { RctaVendorAdapter } from './infrastructure/adapters/RctaVendor';
