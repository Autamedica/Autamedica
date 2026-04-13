import type { SupabaseClient } from '@supabase/supabase-js';
import type { ISODateString, PrescriptionId, PatientId, DoctorId } from '../../domain/models';
import type {
  IDispensationRepository,
  DispensationOrder,
  DispensationOrderId,
  DispensationOrderInsert,
  DispensationOrderStatus,
  DispensationValidation,
  DispensationValidationInsert,
  DispensationEvent,
  DispensationEventInsert,
  DispensationClarification,
  DispensationClarificationInsert,
  PharmacyAuditEvent,
  PharmacyId,
} from '../../domain/pharmacy.ports';
import { logger } from '@autamedica/shared';

function iso(s: string): ISODateString { return s as unknown as ISODateString; }
function pid(s: string): PrescriptionId { return s as unknown as PrescriptionId; }
function patId(s: string): PatientId { return s as unknown as PatientId; }
function docId(s: string): DoctorId { return s as unknown as DoctorId; }

function toSnakeCase(order: DispensationOrderInsert): Record<string, unknown> {
  return {
    prescription_id: order.prescriptionId,
    patient_id: order.patientId,
    doctor_id: order.doctorId,
    pharmacy_id: order.pharmacyId,
    prescription_type: order.prescriptionType,
    medication: order.medication,
    formulation: order.formulation,
    dose_mg_per_day: order.doseMgPerDay,
    quantity_units: order.quantityUnits,
    duration_days: order.durationDays,
    clinician_decision: order.clinicianDecision,
    requires_clarification: order.requiresClarification,
    extraordinary_dose_flag: order.extraordinaryDoseFlag,
    prescriber_verified: order.prescriberVerified,
    reconciliation_status: order.reconciliationStatus,
    clinical_semaphore: order.clinicalSemaphore,
    semaphore_reasons: order.semaphoreReasons,
    dispense_window_start: order.dispenseWindowStart,
    dispense_window_end: order.dispenseWindowEnd,
    prescriber_notes: order.prescriberNotes,
    internal_notes: order.internalNotes,
    status: 'pending',
  };
}

function mapOrder(row: Record<string, unknown>): DispensationOrder {
  return {
    id: row.id as DispensationOrderId,
    prescriptionId: pid(row.prescription_id as string),
    patientId: patId(row.patient_id as string),
    doctorId: docId(row.doctor_id as string),
    pharmacyId: row.pharmacy_id as PharmacyId | undefined,
    prescriptionType: row.prescription_type as DispensationOrder['prescriptionType'],
    medication: row.medication as string,
    formulation: row.formulation as string,
    doseMgPerDay: row.dose_mg_per_day as number,
    quantityUnits: row.quantity_units as number,
    durationDays: row.duration_days as number,
    clinicianDecision: row.clinician_decision as DispensationOrder['clinicianDecision'],
    requiresClarification: row.requires_clarification as boolean,
    extraordinaryDoseFlag: row.extraordinary_dose_flag as boolean,
    prescriberVerified: row.prescriber_verified as boolean,
    reconciliationStatus: row.reconciliation_status as DispensationOrder['reconciliationStatus'],
    clinicalSemaphore: row.clinical_semaphore as DispensationOrder['clinicalSemaphore'],
    semaphoreReasons: row.semaphore_reasons as string[],
    dispenseWindowStart: row.dispense_window_start as string,
    dispenseWindowEnd: row.dispense_window_end as string,
    status: row.status as DispensationOrderStatus,
    prescriberNotes: row.prescriber_notes as string | undefined,
    internalNotes: row.internal_notes as string | undefined,
    createdAt: iso(row.created_at as string),
    updatedAt: iso(row.updated_at as string),
  };
}

function mapValidation(row: Record<string, unknown>): DispensationValidation {
  return {
    id: row.id as string,
    orderId: row.order_id as DispensationOrderId,
    pharmacistId: row.pharmacist_id as DispensationValidation['pharmacistId'],
    validationType: row.validation_type as DispensationValidation['validationType'],
    result: row.result as DispensationValidation['result'],
    details: row.details as string | undefined,
    overrideReason: row.override_reason as string | undefined,
    overrideAuthorizedBy: row.override_authorized_by as DispensationValidation['overrideAuthorizedBy'],
    createdAt: iso(row.created_at as string),
  };
}

function mapEvent(row: Record<string, unknown>): DispensationEvent {
  return {
    id: row.id as string,
    orderId: row.order_id as DispensationOrderId,
    pharmacistId: row.pharmacist_id as DispensationEvent['pharmacistId'],
    pharmacyId: row.pharmacy_id as DispensationEvent['pharmacyId'],
    dispenseStatus: row.dispense_status as DispensationEvent['dispenseStatus'],
    dispensedMedication: row.dispensed_medication as string,
    dispensedFormulation: row.dispensed_formulation as string,
    dispensedQuantity: row.dispensed_quantity as number,
    dispensedBatchNumber: row.dispensed_batch_number as string | undefined,
    dispensedExpiryDate: row.dispensed_expiry_date as string | undefined,
    substitutionType: row.substitution_type as DispensationEvent['substitutionType'],
    substitutionReason: row.substitution_reason as string | undefined,
    substitutionApprovedByPrescriber: row.substitution_approved_by_prescriber as boolean,
    pharmacyNotes: row.pharmacy_notes as string | undefined,
    pharmacistSignatureHash: row.pharmacist_signature_hash as string | undefined,
    dispensedAt: iso(row.dispensed_at as string),
    createdAt: iso(row.created_at as string),
  };
}

function mapClarification(row: Record<string, unknown>): DispensationClarification {
  return {
    id: row.id as string,
    orderId: row.order_id as DispensationOrderId,
    requestedBy: row.requested_by as string,
    respondedBy: row.responded_by as string | undefined,
    question: row.question as string,
    questionCategory: row.question_category as DispensationClarification['questionCategory'],
    response: row.response as string | undefined,
    responseDecision: row.response_decision as DispensationClarification['responseDecision'],
    modifiedFields: row.modified_fields as Record<string, unknown> | undefined,
    status: row.status as DispensationClarification['status'],
    requestedAt: iso(row.requested_at as string),
    respondedAt: row.responded_at ? iso(row.responded_at as string) : undefined,
    expiresAt: iso(row.expires_at as string),
  };
}

export class SupabaseDispensationRepository implements IDispensationRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  // ── Orders ──

  async createOrder(order: DispensationOrderInsert): Promise<DispensationOrderId> {
    const { data, error } = await this.supabase
      .from('dispensation_orders')
      .insert(toSnakeCase(order))
      .select('id')
      .single();
    if (error) {
      logger.error('[DispensationRepo] Failed to create order', error);
      throw error;
    }
    return data.id as DispensationOrderId;
  }

  async findOrderById(id: DispensationOrderId): Promise<DispensationOrder | null> {
    const { data, error } = await this.supabase
      .from('dispensation_orders')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      logger.error('[DispensationRepo] Failed to find order by id', error);
      throw error;
    }
    if (!data) return null;
    return mapOrder(data as Record<string, unknown>);
  }

  async findOrdersByPharmacy(
    pharmacyId: PharmacyId,
    status?: DispensationOrderStatus
  ): Promise<DispensationOrder[]> {
    let query = this.supabase
      .from('dispensation_orders')
      .select('*')
      .eq('pharmacy_id', pharmacyId);
    if (status) {
      query = query.eq('status', status);
    }
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) {
      logger.error('[DispensationRepo] Failed to find orders by pharmacy', error);
      throw error;
    }
    return (data as Record<string, unknown>[]).map(mapOrder);
  }

  async findOrdersByPatient(patientId: string): Promise<DispensationOrder[]> {
    const { data, error } = await this.supabase
      .from('dispensation_orders')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });
    if (error) {
      logger.error('[DispensationRepo] Failed to find orders by patient', error);
      throw error;
    }
    return (data as Record<string, unknown>[]).map(mapOrder);
  }

  async findOrdersByDoctor(doctorId: string): Promise<DispensationOrder[]> {
    const { data, error } = await this.supabase
      .from('dispensation_orders')
      .select('*')
      .eq('doctor_id', doctorId)
      .order('created_at', { ascending: false });
    if (error) {
      logger.error('[DispensationRepo] Failed to find orders by doctor', error);
      throw error;
    }
    return (data as Record<string, unknown>[]).map(mapOrder);
  }

  async updateOrderStatus(id: DispensationOrderId, status: DispensationOrderStatus): Promise<void> {
    const { error } = await this.supabase
      .from('dispensation_orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      logger.error('[DispensationRepo] Failed to update order status', error);
      throw error;
    }
  }

  // ── Validations ──

  async recordValidation(validation: DispensationValidationInsert): Promise<void> {
    const { error } = await this.supabase
      .from('dispensation_validations')
      .insert({
        order_id: validation.orderId,
        pharmacist_id: validation.pharmacistId,
        validation_type: validation.validationType,
        result: validation.result,
        details: validation.details,
        override_reason: validation.overrideReason,
        override_authorized_by: validation.overrideAuthorizedBy,
      });
    if (error) {
      logger.error('[DispensationRepo] Failed to record validation', error);
      throw error;
    }
  }

  async getValidationsForOrder(orderId: DispensationOrderId): Promise<DispensationValidation[]> {
    const { data, error } = await this.supabase
      .from('dispensation_validations')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });
    if (error) {
      logger.error('[DispensationRepo] Failed to get validations', error);
      throw error;
    }
    return (data as Record<string, unknown>[]).map(mapValidation);
  }

  // ── Dispensation Events ──

  async recordDispensation(event: DispensationEventInsert): Promise<void> {
    const { error } = await this.supabase
      .from('dispensation_events')
      .insert({
        order_id: event.orderId,
        pharmacist_id: event.pharmacistId,
        pharmacy_id: event.pharmacyId,
        dispense_status: event.dispenseStatus,
        dispensed_medication: event.dispensedMedication,
        dispensed_formulation: event.dispensedFormulation,
        dispensed_quantity: event.dispensedQuantity,
        dispensed_batch_number: event.dispensedBatchNumber,
        dispensed_expiry_date: event.dispensedExpiryDate,
        substitution_type: event.substitutionType,
        substitution_reason: event.substitutionReason,
        substitution_approved_by_prescriber: event.substitutionApprovedByPrescriber,
        pharmacy_notes: event.pharmacyNotes,
        pharmacist_signature_hash: event.pharmacistSignatureHash,
        dispensed_at: event.dispensedAt,
      });
    if (error) {
      logger.error('[DispensationRepo] Failed to record dispensation', error);
      throw error;
    }
  }

  async getDispensationsForOrder(orderId: DispensationOrderId): Promise<DispensationEvent[]> {
    const { data, error } = await this.supabase
      .from('dispensation_events')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });
    if (error) {
      logger.error('[DispensationRepo] Failed to get dispensations', error);
      throw error;
    }
    return (data as Record<string, unknown>[]).map(mapEvent);
  }

  // ── Clarifications ──

  async createClarification(clarification: DispensationClarificationInsert): Promise<string> {
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.supabase
      .from('dispensation_clarifications')
      .insert({
        order_id: clarification.orderId,
        requested_by: clarification.requestedBy,
        question: clarification.question,
        question_category: clarification.questionCategory,
        status: 'pending',
        requested_at: new Date().toISOString(),
        expires_at: expiresAt,
      })
      .select('id')
      .single();
    if (error) {
      logger.error('[DispensationRepo] Failed to create clarification', error);
      throw error;
    }
    return data.id as string;
  }

  async respondToClarification(
    clarificationId: string,
    response: {
      respondedBy: string;
      response: string;
      responseDecision: 'confirmed' | 'modified' | 'cancelled';
      modifiedFields?: Record<string, unknown>;
    }
  ): Promise<void> {
    const { error } = await this.supabase
      .from('dispensation_clarifications')
      .update({
        responded_by: response.respondedBy,
        response: response.response,
        response_decision: response.responseDecision,
        modified_fields: response.modifiedFields,
        status: 'responded',
        responded_at: new Date().toISOString(),
      })
      .eq('id', clarificationId);
    if (error) {
      logger.error('[DispensationRepo] Failed to respond to clarification', error);
      throw error;
    }
  }

  async getPendingClarifications(orderId: DispensationOrderId): Promise<DispensationClarification[]> {
    const { data, error } = await this.supabase
      .from('dispensation_clarifications')
      .select('*')
      .eq('order_id', orderId)
      .eq('status', 'pending')
      .order('requested_at', { ascending: true });
    if (error) {
      logger.error('[DispensationRepo] Failed to get pending clarifications', error);
      throw error;
    }
    return (data as Record<string, unknown>[]).map(mapClarification);
  }

  // ── Audit ──

  async logAuditEvent(event: Omit<PharmacyAuditEvent, 'id' | 'timestamp'>): Promise<void> {
    const { error } = await this.supabase
      .from('pharmacy_audit_events')
      .insert({
        order_id: event.orderId,
        event_type: event.eventType,
        actor_id: event.actorId,
        actor_role: event.actorRole,
        details: event.details,
        ip_address: event.ipAddress,
      });
    if (error) {
      logger.error('[DispensationRepo] Failed to log audit event', error);
      throw error;
    }
  }
}
