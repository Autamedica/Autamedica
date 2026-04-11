// ── Prescription Domain ──
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
export { SupabaseIdentityValidator } from './infrastructure/adapters/SupabaseIdentityValidator';
export { SupabaseDispensationRepository } from './infrastructure/adapters/SupabaseDispensationRepository';
export { SupabasePharmacyRegistry } from './infrastructure/adapters/SupabasePharmacyRegistry';
export { SupabasePharmacyNotifier } from './infrastructure/adapters/SupabasePharmacyNotifier';

// ── Pharmacy Dispensation Domain ──
export type {
  DispensationOrderId,
  PharmacyId,
  PharmacistId,
  PrescriptionClassification,
  DispensationOrderStatus,
  ClinicalSemaphore,
  ClinicianDecision,
  ReconciliationStatus,
  DispenseOutcome,
  ValidationType,
  ValidationResult,
  SubstitutionType,
  ClarificationCategory,
  ClarificationResponseDecision,
  ClarificationStatus,
  PharmacistRole,
  PharmacyAuditEventType,
  Pharmacy,
  PharmacyAddress,
  Pharmacist,
  DispensationOrder,
  DispensationOrderInsert,
  DispensationValidation,
  DispensationValidationInsert,
  DispensationEvent,
  DispensationEventInsert,
  DispensationClarification,
  DispensationClarificationInsert,
  PharmacyAuditEvent,
} from './domain/pharmacy.models';

export {
  VALID_ORDER_TRANSITIONS,
  isValidTransition,
  getRequiredValidations,
  areAllValidationsPassed,
  ORDER_STATUS_LABELS,
  PRESCRIPTION_TYPE_LABELS,
  SEMAPHORE_LABELS,
  VALIDATION_TYPE_LABELS,
} from './domain/pharmacy.models';

export type {
  IDispensationRepository,
  IPharmacyRegistry,
  IPharmacyNotifier,
} from './domain/pharmacy.ports';

export {
  CreateDispensationOrderUseCase,
  ValidateDispensationUseCase,
  ExecuteDispensationUseCase,
  RequestClarificationUseCase,
} from './usecases/PharmacyUseCases';

// ── Regulatory Ports ──
export type { IDigitalSignatureService, SignerIdentity, SignedPdfResult, VerificationResult } from './domain/signature.ports';
export type { IRefepsValidator, RefepsValidationResult } from './domain/refeps.ports';
export type { IPharmacyConventionService, ConventionStatus } from './domain/pharmacy-convention.ports';
export type { IInsuranceCoverageService, CoverageResult } from './domain/insurance.ports';

// ── Regulatory Adapters ──
export { X509SignatureService } from './infrastructure/adapters/X509SignatureService';
export { LocalRefepsValidator } from './infrastructure/adapters/LocalRefepsValidator';
export { RefepsApiValidator } from './infrastructure/adapters/RefepsApiValidator';
export { LocalPharmacyConvention } from './infrastructure/adapters/LocalPharmacyConvention';
export { LocalInsuranceCoverage } from './infrastructure/adapters/LocalInsuranceCoverage';
