import type {
  DispensationOrder,
  DispensationOrderId,
  DispensationOrderInsert,
  DispensationOrderStatus,
  DispensationEvent,
  DispensationEventInsert,
  DispensationValidation,
  DispensationValidationInsert,
  DispensationClarification,
  DispensationClarificationInsert,
  PharmacyAuditEvent,
  PharmacyAuditEventType,
  Pharmacy,
  PharmacyId,
  Pharmacist,
  PharmacistId,
} from './pharmacy.models';

export type {
  DispensationOrder,
  DispensationOrderId,
  DispensationOrderInsert,
  DispensationOrderStatus,
  DispensationEvent,
  DispensationEventInsert,
  DispensationValidation,
  DispensationValidationInsert,
  DispensationClarification,
  DispensationClarificationInsert,
  PharmacyAuditEvent,
  Pharmacy,
  PharmacyId,
  Pharmacist,
  PharmacistId,
};

// ══════════════════════════════════════════════
// Repository Port — Dispensation Domain
// ══════════════════════════════════════════════

/**
 * Primary repository for dispensation order operations.
 * Implementations should handle DB access + audit logging.
 */
export interface IDispensationRepository {
  // ── Orders ──
  createOrder(order: DispensationOrderInsert): Promise<DispensationOrderId>;
  findOrderById(id: DispensationOrderId): Promise<DispensationOrder | null>;
  findOrdersByPharmacy(pharmacyId: PharmacyId, status?: DispensationOrderStatus): Promise<DispensationOrder[]>;
  findOrdersByPatient(patientId: string): Promise<DispensationOrder[]>;
  findOrdersByDoctor(doctorId: string): Promise<DispensationOrder[]>;
  updateOrderStatus(id: DispensationOrderId, status: DispensationOrderStatus): Promise<void>;

  // ── Validations ──
  recordValidation(validation: DispensationValidationInsert): Promise<void>;
  getValidationsForOrder(orderId: DispensationOrderId): Promise<DispensationValidation[]>;

  // ── Dispensation Events ──
  recordDispensation(event: DispensationEventInsert): Promise<void>;
  getDispensationsForOrder(orderId: DispensationOrderId): Promise<DispensationEvent[]>;

  // ── Clarifications ──
  createClarification(clarification: DispensationClarificationInsert): Promise<string>;
  respondToClarification(
    clarificationId: string,
    response: {
      respondedBy: string;
      response: string;
      responseDecision: 'confirmed' | 'modified' | 'cancelled';
      modifiedFields?: Record<string, unknown>;
    }
  ): Promise<void>;
  getPendingClarifications(orderId: DispensationOrderId): Promise<DispensationClarification[]>;

  // ── Audit ──
  logAuditEvent(event: Omit<PharmacyAuditEvent, 'id' | 'timestamp'>): Promise<void>;
}

// ══════════════════════════════════════════════
// Pharmacy Registry Port
// ══════════════════════════════════════════════

/**
 * Port for pharmacy and pharmacist management.
 */
export interface IPharmacyRegistry {
  findPharmacyById(id: PharmacyId): Promise<Pharmacy | null>;
  findPharmacistByUserId(userId: string): Promise<Pharmacist | null>;
  findPharmacistsByPharmacy(pharmacyId: PharmacyId): Promise<Pharmacist[]>;
  getPharmacyForUser(userId: string): Promise<Pharmacy | null>;
}

// ══════════════════════════════════════════════
// Notification Port (for clarification alerts)
// ══════════════════════════════════════════════

/**
 * Port for sending notifications in the pharmacy workflow.
 */
export interface IPharmacyNotifier {
  /**
   * Notify prescriber that pharmacy requests clarification.
   */
  notifyClarificationRequested(
    doctorUserId: string,
    orderId: DispensationOrderId,
    question: string,
    category: string
  ): Promise<void>;

  /**
   * Notify pharmacist that prescriber responded to clarification.
   */
  notifyClarificationResponded(
    pharmacistUserId: string,
    orderId: DispensationOrderId
  ): Promise<void>;

  /**
   * Notify prescriber that dispensation was completed.
   */
  notifyDispensationCompleted(
    doctorUserId: string,
    orderId: DispensationOrderId,
    eventType: PharmacyAuditEventType
  ): Promise<void>;
}
