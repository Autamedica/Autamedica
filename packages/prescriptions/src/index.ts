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

// ── Sprint 1 Compliance: RENPRE + Consent + Guards ──
export type {
  IRenpreValidator,
  RenpreRegistration,
  RenpreStatus,
  RenpreUploadInput,
} from './domain/renpre.ports';

export type {
  IConsentRepository,
  InformedConsent,
  ConsentType,
  ConsentSignInput,
} from './domain/consent.ports';

export {
  PrescriptionGuards,
  PrescriptionBlockedError,
  PRESCRIPTION_BLOCK_CODES,
  classifyDrug,
} from './domain/guards';
export type { DrugCategory, PrescriptionBlockCode, GuardContext } from './domain/guards';

export { SupabaseRenpreValidator } from './infrastructure/adapters/SupabaseRenpreValidator';
export { SupabaseConsentRepository } from './infrastructure/adapters/SupabaseConsentRepository';

export {
  renderPhysicalRecipeHtml,
  requiresPhysicalRecipe,
} from './infrastructure/adapters/PhysicalRecipeGenerator';
export type { PhysicalRecipeCopies, PhysicalRecipeOutput } from './infrastructure/adapters/PhysicalRecipeGenerator';

// ── Sprint 2: Lakaut signature + Andreani shipping + Adherence ──
export { LakautSignatureAdapter } from './infrastructure/adapters/LakautSignatureAdapter';
export type { LakautConfig } from './infrastructure/adapters/LakautSignatureAdapter';

export type {
  IShippingService,
  IShipmentRepository,
  ShipmentCourier,
  ShipmentStatus,
  ServiceLevel,
  ShippingAddress,
  ShipmentDraft,
  CreatedShipment,
  ShipmentEventInput,
} from './domain/shipping.ports';

export { AndreaniFarmaAdapter } from './infrastructure/adapters/AndreaniFarmaAdapter';
export type { AndreaniConfig } from './infrastructure/adapters/AndreaniFarmaAdapter';

export { SupabaseShipmentRepository } from './infrastructure/adapters/SupabaseShipmentRepository';

export type {
  IAdherenceRepository,
  MedicationSchedule,
  MedicationScheduleDraft,
  IntakeEvent,
  AdherenceReport,
  DaysPattern,
  TimeOfDay,
} from './domain/adherence.ports';

export { SupabaseAdherenceRepository } from './infrastructure/adapters/SupabaseAdherenceRepository';

// ── Sprint 3: ANMAT SNT + Insurance authorization + Pharmacovigilance ──
export type {
  IAnmatSntReporter,
  IAnmatTraceRepository,
  AnmatInformPayload,
  AnmatInformResult,
  AnmatTraceEvent,
  AnmatTraceStatus,
  AnmatEventType,
} from './domain/anmat.ports';
export { AnmatSntAdapter } from './infrastructure/adapters/AnmatSntAdapter';
export type { AnmatConfig } from './infrastructure/adapters/AnmatSntAdapter';
export { SupabaseAnmatTraceRepository } from './infrastructure/adapters/SupabaseAnmatTraceRepository';

export type {
  IInsuranceAuthorizationService,
  IInsuranceAuthorizationRouter,
  InsuranceProvider,
  AuthorizationStatus,
  AuthorizationRequest,
  AuthorizationResult,
} from './domain/insurance-authorization.ports';
export { OsdeAuthorizationAdapter } from './infrastructure/adapters/OsdeAuthorizationAdapter';
export type { OsdeConfig } from './infrastructure/adapters/OsdeAuthorizationAdapter';
export { InsuranceAuthorizationRouter } from './infrastructure/adapters/InsuranceAuthorizationRouter';

export type {
  IAdverseReactionRepository,
  AdverseReactionReport,
  AdverseReactionDraft,
  AdverseReactionEvaluation,
  AdverseReactionSymptom,
  AdverseReactionSeverity,
  Causality,
  Outcome,
  ReportedBy,
  AdrStatus,
} from './domain/pharmacovigilance.ports';
export { SupabaseAdverseReactionRepository } from './infrastructure/adapters/SupabaseAdverseReactionRepository';
