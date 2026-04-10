import type {
  PrescriptionId,
  PatientId,
  DoctorId,
  ISODateString,
} from '@autamedica/types';

// ══════════════════════════════════════════════
// Branded IDs
// ══════════════════════════════════════════════

export type DispensationOrderId = string & { readonly __brand: 'DispensationOrderId' };
export type PharmacyId = string & { readonly __brand: 'PharmacyId' };
export type PharmacistId = string & { readonly __brand: 'PharmacistId' };

// ══════════════════════════════════════════════
// Enums
// ══════════════════════════════════════════════

export type PrescriptionClassification =
  | 'standard'
  | 'transition_bridge'
  | 'continuation'
  | 'emergency';

export type DispensationOrderStatus =
  | 'pending'
  | 'assigned'
  | 'under_review'
  | 'clarification_requested'
  | 'clarification_provided'
  | 'approved_for_dispensation'
  | 'dispensed'
  | 'partially_dispensed'
  | 'blocked'
  | 'cancelled'
  | 'expired';

export type ClinicalSemaphore = 'green' | 'yellow' | 'red';

export type ClinicianDecision = 'approved' | 'conditional' | 'under_review';

export type ReconciliationStatus = 'reconciled' | 'partial' | 'pending' | 'conflict';

export type DispenseOutcome =
  | 'dispensed'
  | 'partially_dispensed'
  | 'blocked'
  | 'substituted';

export type ValidationType =
  | 'patient_identity'
  | 'prescriber_identity'
  | 'medication_match'
  | 'formulation_match'
  | 'dose_check'
  | 'quantity_check'
  | 'validity_check'
  | 'bridge_protocol'
  | 'interaction_check'
  | 'duplicate_check'
  | 'controlled_substance';

export type ValidationResult = 'pass' | 'fail' | 'warning' | 'overridden';

export type SubstitutionType =
  | 'none'
  | 'generic_equivalent'
  | 'therapeutic_equivalent'
  | 'emergency_substitute';

export type ClarificationCategory =
  | 'dose_verification'
  | 'formulation_mismatch'
  | 'duration_concern'
  | 'interaction_alert'
  | 'bridge_protocol'
  | 'identity_concern'
  | 'other';

export type ClarificationResponseDecision = 'confirmed' | 'modified' | 'cancelled';

export type ClarificationStatus = 'pending' | 'responded' | 'expired';

export type PharmacistRole = 'pharmacist' | 'pharmacy_director' | 'pharmacy_tech';

export type PharmacyAuditEventType =
  | 'order_created'
  | 'order_assigned'
  | 'validation_performed'
  | 'clarification_requested'
  | 'clarification_responded'
  | 'dispensation_approved'
  | 'dispensation_executed'
  | 'substitution_requested'
  | 'substitution_approved'
  | 'order_blocked'
  | 'order_cancelled'
  | 'order_expired'
  | 'bridge_protocol_activated'
  | 'extraordinary_dose_flagged';

// ══════════════════════════════════════════════
// Core Domain Models
// ══════════════════════════════════════════════

/** Pharmacy entity authorized to dispense */
export interface Pharmacy {
  id: PharmacyId;
  name: string;
  licenseNumber: string;
  address: PharmacyAddress;
  phone?: string;
  email?: string;
  active: boolean;
  organizationId?: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface PharmacyAddress {
  street?: string;
  city?: string;
  province?: string;
  zip?: string;
  lat?: number;
  lng?: number;
}

/** Licensed pharmacist operating within a pharmacy */
export interface Pharmacist {
  id: PharmacistId;
  userId: string;
  pharmacyId: PharmacyId;
  licenseNumber: string;
  licenseProvince: string;
  fullName: string;
  role: PharmacistRole;
  active: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/**
 * Structured dispensation order received by the pharmacy.
 * This is NOT a raw PDF — it's a clinically annotated object
 * carrying prescriber decisions, semaphore state, and safety flags.
 */
export interface DispensationOrder {
  id: DispensationOrderId;
  prescriptionId: PrescriptionId;
  patientId: PatientId;
  doctorId: DoctorId;
  pharmacyId?: PharmacyId;

  // Clinical data
  prescriptionType: PrescriptionClassification;
  medication: string;
  formulation: string;
  doseMgPerDay: number;
  quantityUnits: number;
  durationDays: number;

  // Prescriber flags
  clinicianDecision: ClinicianDecision;
  requiresClarification: boolean;
  extraordinaryDoseFlag: boolean;
  prescriberVerified: boolean;
  reconciliationStatus: ReconciliationStatus;

  // Clinical semaphore (inherited from psychiatry intake)
  clinicalSemaphore: ClinicalSemaphore;
  semaphoreReasons: string[];

  // Dispensation window
  dispenseWindowStart: string;
  dispenseWindowEnd: string;

  // Order state
  status: DispensationOrderStatus;
  prescriberNotes?: string;
  internalNotes?: string;

  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Input to create a new dispensation order */
export type DispensationOrderInsert = Omit<
  DispensationOrder,
  'id' | 'status' | 'createdAt' | 'updatedAt'
>;

/** A single validation check performed by a pharmacist on an order */
export interface DispensationValidation {
  id: string;
  orderId: DispensationOrderId;
  pharmacistId: PharmacistId;
  validationType: ValidationType;
  result: ValidationResult;
  details?: string;
  overrideReason?: string;
  overrideAuthorizedBy?: PharmacistId;
  createdAt: ISODateString;
}

/** Input to record a new validation */
export type DispensationValidationInsert = Omit<
  DispensationValidation,
  'id' | 'createdAt'
>;

/** A physical dispensation event — the act of handing over medication */
export interface DispensationEvent {
  id: string;
  orderId: DispensationOrderId;
  pharmacistId: PharmacistId;
  pharmacyId: PharmacyId;

  dispenseStatus: DispenseOutcome;
  dispensedMedication: string;
  dispensedFormulation: string;
  dispensedQuantity: number;
  dispensedBatchNumber?: string;
  dispensedExpiryDate?: string;

  substitutionType: SubstitutionType;
  substitutionReason?: string;
  substitutionApprovedByPrescriber: boolean;

  pharmacyNotes?: string;
  pharmacistSignatureHash?: string;

  dispensedAt: ISODateString;
  createdAt: ISODateString;
}

/** Input to record a new dispensation event */
export type DispensationEventInsert = Omit<
  DispensationEvent,
  'id' | 'createdAt'
>;

/** Structured dialogue between pharmacy and prescriber */
export interface DispensationClarification {
  id: string;
  orderId: DispensationOrderId;

  requestedBy: string;
  respondedBy?: string;

  question: string;
  questionCategory: ClarificationCategory;

  response?: string;
  responseDecision?: ClarificationResponseDecision;
  modifiedFields?: Record<string, unknown>;

  status: ClarificationStatus;

  requestedAt: ISODateString;
  respondedAt?: ISODateString;
  expiresAt: ISODateString;
}

/** Input to create a new clarification request */
export type DispensationClarificationInsert = Pick<
  DispensationClarification,
  'orderId' | 'requestedBy' | 'question' | 'questionCategory'
>;

/** Immutable audit event for the pharmacy module */
export interface PharmacyAuditEvent {
  id: string;
  orderId: DispensationOrderId;
  eventType: PharmacyAuditEventType;
  actorId: string;
  actorRole: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  timestamp: ISODateString;
}

// ══════════════════════════════════════════════
// Valid State Transitions
// ══════════════════════════════════════════════

/**
 * Defines valid state transitions for dispensation orders.
 * Used for client-side validation before DB round-trip.
 */
export const VALID_ORDER_TRANSITIONS: Record<DispensationOrderStatus, DispensationOrderStatus[]> = {
  pending: ['assigned', 'expired', 'cancelled'],
  assigned: ['under_review', 'expired', 'cancelled'],
  under_review: ['clarification_requested', 'approved_for_dispensation', 'blocked', 'cancelled'],
  clarification_requested: ['clarification_provided', 'cancelled', 'expired'],
  clarification_provided: ['under_review', 'cancelled'],
  approved_for_dispensation: ['dispensed', 'partially_dispensed', 'cancelled'],
  dispensed: [],
  partially_dispensed: ['dispensed', 'cancelled'],
  blocked: ['clarification_requested', 'cancelled'],
  cancelled: [],
  expired: [],
};

/**
 * Checks if a transition from one status to another is valid.
 */
export function isValidTransition(
  from: DispensationOrderStatus,
  to: DispensationOrderStatus
): boolean {
  return VALID_ORDER_TRANSITIONS[from].includes(to);
}

/**
 * Returns all required validation types for an order
 * based on its clinical classification and flags.
 */
export function getRequiredValidations(order: DispensationOrder): ValidationType[] {
  const required: ValidationType[] = [
    'patient_identity',
    'prescriber_identity',
    'medication_match',
    'formulation_match',
    'quantity_check',
    'validity_check',
  ];

  if (order.extraordinaryDoseFlag) {
    required.push('dose_check');
  }

  if (order.prescriptionType === 'transition_bridge') {
    required.push('bridge_protocol');
  }

  // Controlled substance check is always required for stimulants
  const controlledSubstances = [
    'metilfenidato', 'methylphenidate',
    'lisdexanfetamina', 'lisdexamfetamine',
    'anfetamina', 'amphetamine',
    'modafinilo', 'modafinil',
    'atomoxetina', 'atomoxetine',
  ];
  if (controlledSubstances.some(s => order.medication.toLowerCase().includes(s))) {
    required.push('controlled_substance');
  }

  return required;
}

/**
 * Checks if all required validations have passed for an order.
 */
export function areAllValidationsPassed(
  order: DispensationOrder,
  validations: DispensationValidation[]
): boolean {
  const required = getRequiredValidations(order);
  return required.every(type =>
    validations.some(
      v => v.validationType === type && (v.result === 'pass' || v.result === 'overridden')
    )
  );
}

// ══════════════════════════════════════════════
// Display Helpers
// ══════════════════════════════════════════════

export const ORDER_STATUS_LABELS: Record<DispensationOrderStatus, string> = {
  pending: 'Pendiente',
  assigned: 'Asignada',
  under_review: 'En Revisión',
  clarification_requested: 'Aclaración Requerida',
  clarification_provided: 'Aclaración Recibida',
  approved_for_dispensation: 'Aprobada para Dispensación',
  dispensed: 'Dispensada',
  partially_dispensed: 'Parcialmente Dispensada',
  blocked: 'Bloqueada',
  cancelled: 'Cancelada',
  expired: 'Expirada',
};

export const PRESCRIPTION_TYPE_LABELS: Record<PrescriptionClassification, string> = {
  standard: 'Estándar',
  transition_bridge: 'Puente de Transición',
  continuation: 'Continuidad',
  emergency: 'Emergencia',
};

export const SEMAPHORE_LABELS: Record<ClinicalSemaphore, string> = {
  green: '🟢 Verde — Sin alertas',
  yellow: '🟡 Amarillo — Precaución',
  red: '🔴 Rojo — Acción requerida',
};

export const VALIDATION_TYPE_LABELS: Record<ValidationType, string> = {
  patient_identity: 'Identidad del paciente',
  prescriber_identity: 'Identidad del prescriptor',
  medication_match: 'Medicamento coincide',
  formulation_match: 'Formulación verificada',
  dose_check: 'Dosis revisada',
  quantity_check: 'Cantidad verificada',
  validity_check: 'Vigencia de receta',
  bridge_protocol: 'Protocolo de puente',
  interaction_check: 'Interacciones',
  duplicate_check: 'Duplicado verificado',
  controlled_substance: 'Sustancia controlada (ANMAT)',
};
