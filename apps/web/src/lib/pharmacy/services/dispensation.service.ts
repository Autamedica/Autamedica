/**
 * Service: Pharmacy dispensation business logic.
 * Orchestrates repository calls and enforces business rules.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { dispensationRepo } from '../repos/dispensation.repo';
import { requiresStrictPrescriptionValidation } from '@/lib/prescriptions/strict-validation';

type Client = SupabaseClient;

const VALID_STATUSES = [
  'pending', 'assigned', 'under_review', 'clarification_requested',
  'clarification_provided', 'approved_for_dispensation', 'dispensed',
  'partially_dispensed', 'blocked', 'cancelled', 'expired',
] as const;

const VALID_VALIDATION_TYPES = [
  'patient_identity', 'prescriber_identity', 'medication_match',
  'formulation_match', 'dose_check', 'quantity_check', 'validity_check',
  'bridge_protocol', 'interaction_check', 'duplicate_check', 'controlled_substance',
] as const;

const VALID_RESULTS = ['pass', 'fail', 'warning', 'overridden'] as const;

const VALIDATABLE_STATUSES = ['assigned', 'under_review', 'clarification_provided'];
const DISPENSABLE_STATUSES = ['approved_for_dispensation', 'partially_dispensed'];

export interface ValidateInput {
  validation_type: string;
  result: string;
  details?: string;
  override_reason?: string;
}

export interface DispenseInput {
  dispensed_medication: string;
  dispensed_formulation: string;
  dispensed_quantity: number;
  batch_number?: string;
  expiry_date?: string;
  substitution_type?: string;
  substitution_reason?: string;
  substitution_approved_by_prescriber?: boolean;
  pharmacy_notes?: string;
}

export type ServiceError =
  | { code: 'not_pharmacist' }
  | { code: 'no_orders' }
  | { code: 'order_not_found' }
  | { code: 'order_not_in_pharmacy' }
  | { code: 'invalid_status'; status: string }
  | { code: 'invalid_validation_type' }
  | { code: 'invalid_result' }
  | { code: 'override_requires_reason' }
  | { code: 'missing_fields' }
  | { code: 'invalid_dispense_quantity' }
  | { code: 'dispense_quantity_exceeds_remaining' }
  | { code: 'bridge_formulation_mismatch' }
  | { code: 'bridge_quantity_mismatch' }
  | { code: 'internal'; error: unknown };

type Result<T> = { ok: true; data: T } | { ok: false; error: ServiceError };

function ok<T>(data: T): Result<T> { return { ok: true, data }; }
function fail<T>(error: ServiceError): Result<T> { return { ok: false, error }; }

export const dispensationService = {
  filterStatuses(raw: string[]): string[] {
    return raw.filter((s): s is string =>
      (VALID_STATUSES as readonly string[]).includes(s)
    );
  },

  async listOrders(
    supabase: Client,
    userId: string,
    statusFilter: string[],
    limit: number,
  ): Promise<Result<{ orders: unknown[]; pharmacistId: string | null }>> {
    const pharmacist = await dispensationRepo.findPharmacist(supabase, userId);
    if (!pharmacist) return ok({ orders: [], pharmacistId: null });

    const pharmacyId = pharmacist.pharmacy_id;
    const orders = pharmacyId
      ? await dispensationRepo.listOrdersByPharmacy(supabase, pharmacyId, statusFilter, limit)
      : [];

    let allOrders = orders;
    if (statusFilter.length === 0 || statusFilter.includes('pending')) {
      const unassigned = await dispensationRepo.listUnassignedOrders(supabase, limit);
      allOrders = [...unassigned, ...orders];
    }

    return ok({ orders: allOrders, pharmacistId: pharmacist.id });
  },

  async claimOrder(
    supabase: Client,
    userId: string,
    orderId: string,
  ): Promise<Result<{ status: string }>> {
    const pharmacist = await dispensationRepo.findPharmacist(supabase, userId);
    if (!pharmacist) return fail({ code: 'not_pharmacist' });
    if (!pharmacist.pharmacy_id) return fail({ code: 'not_pharmacist' });

    const order = await dispensationRepo.findOrderById(supabase, orderId);
    if (!order) return fail({ code: 'order_not_found' });
    if (order.pharmacy_id !== null) return fail({ code: 'order_not_in_pharmacy' });
    if (order.status !== 'pending') return fail({ code: 'invalid_status', status: order.status });

    await dispensationRepo.claimOrder(supabase, orderId, pharmacist.pharmacy_id);

    await dispensationRepo.logAudit(supabase, {
      order_id: orderId,
      event_type: 'order_assigned',
      actor_id: userId,
      actor_role: 'pharmacist',
      details: { pharmacy_id: pharmacist.pharmacy_id },
    });

    return ok({ status: 'assigned' });
  },

  async validate(
    supabase: Client,
    userId: string,
    orderId: string,
    input: ValidateInput,
  ): Promise<Result<{ status: string; all_passed: boolean; completed: string[]; remaining: string[] }>> {
    // Input validation
    if (!(VALID_VALIDATION_TYPES as readonly string[]).includes(input.validation_type)) {
      return fail({ code: 'invalid_validation_type' });
    }
    if (!(VALID_RESULTS as readonly string[]).includes(input.result)) {
      return fail({ code: 'invalid_result' });
    }
    if (input.result === 'overridden' && !input.override_reason) {
      return fail({ code: 'override_requires_reason' });
    }

    const pharmacist = await dispensationRepo.findPharmacist(supabase, userId);
    if (!pharmacist) return fail({ code: 'not_pharmacist' });

    const order = await dispensationRepo.findOrderById(supabase, orderId);
    if (!order) return fail({ code: 'order_not_found' });
    if (order.pharmacy_id !== pharmacist.pharmacy_id) return fail({ code: 'order_not_in_pharmacy' });
    if (!VALIDATABLE_STATUSES.includes(order.status)) {
      return fail({ code: 'invalid_status', status: order.status });
    }

    // Auto-transition assigned → under_review
    if (order.status === 'assigned') {
      await dispensationRepo.updateOrderStatus(supabase, orderId, 'under_review');
    }

    // Record validation
    await dispensationRepo.insertValidation(supabase, {
      order_id: orderId,
      pharmacist_id: pharmacist.id,
      validation_type: input.validation_type,
      result: input.result,
      details: input.details ?? null,
      override_reason: input.override_reason ?? null,
      override_authorized_by: input.result === 'overridden' ? pharmacist.id : null,
    });

    // Audit
    await dispensationRepo.logAudit(supabase, {
      order_id: orderId,
      event_type: 'validation_performed',
      actor_id: userId,
      actor_role: 'pharmacist',
      details: { validation_type: input.validation_type, result: input.result },
    });

    // If failed → block
    if (input.result === 'fail') {
      await dispensationRepo.updateOrderStatus(supabase, orderId, 'blocked');
      await dispensationRepo.logAudit(supabase, {
        order_id: orderId,
        event_type: 'order_blocked',
        actor_id: userId,
        actor_role: 'pharmacist',
        details: { reason: `validation_failed:${input.validation_type}` },
      });
      return ok({ status: 'blocked', all_passed: false, completed: [], remaining: [] });
    }

    // Check completion
    const allValidations = await dispensationRepo.getValidationsForOrder(supabase, orderId);
    const passedTypes = new Set(
      allValidations
        .filter(v => v.result === 'pass' || v.result === 'overridden')
        .map(v => v.validation_type)
    );

    const required = [
      'patient_identity', 'prescriber_identity', 'medication_match',
      'formulation_match', 'quantity_check', 'validity_check',
    ];
    if (order.extraordinary_dose_flag) required.push('dose_check');
    if (order.prescription_type === 'transition_bridge') required.push('bridge_protocol');
    if (order.medication && requiresStrictPrescriptionValidation(order.medication)) {
      required.push('controlled_substance');
    }

    const allPassed = required.every(r => passedTypes.has(r));

    if (allPassed) {
      await dispensationRepo.updateOrderStatus(supabase, orderId, 'approved_for_dispensation');
      await dispensationRepo.logAudit(supabase, {
        order_id: orderId,
        event_type: 'dispensation_approved',
        actor_id: userId,
        actor_role: 'pharmacist',
        details: { validations_completed: required.length },
      });
    }

    return ok({
      status: allPassed ? 'approved_for_dispensation' : 'under_review',
      all_passed: allPassed,
      completed: [...passedTypes],
      remaining: required.filter(r => !passedTypes.has(r)),
    });
  },

  async dispense(
    supabase: Client,
    userId: string,
    orderId: string,
    input: DispenseInput,
  ): Promise<Result<{ status: string; total_dispensed: number; target_quantity: number; prescription_status_updated: string }>> {
    if (!input.dispensed_medication || !input.dispensed_formulation || !input.dispensed_quantity) {
      return fail({ code: 'missing_fields' });
    }
    if (!Number.isFinite(input.dispensed_quantity) || input.dispensed_quantity <= 0) {
      return fail({ code: 'invalid_dispense_quantity' });
    }

    const pharmacist = await dispensationRepo.findPharmacist(supabase, userId);
    if (!pharmacist) return fail({ code: 'not_pharmacist' });

    const order = await dispensationRepo.findOrderById(supabase, orderId);
    if (!order) return fail({ code: 'order_not_found' });
    if (order.pharmacy_id !== pharmacist.pharmacy_id) return fail({ code: 'order_not_in_pharmacy' });
    if (!DISPENSABLE_STATUSES.includes(order.status)) {
      return fail({ code: 'invalid_status', status: order.status });
    }

    // Bridge: exact match
    if (order.prescription_type === 'transition_bridge') {
      if (input.dispensed_formulation !== order.formulation) {
        return fail({ code: 'bridge_formulation_mismatch' });
      }
      if (input.dispensed_quantity !== order.quantity_units) {
        return fail({ code: 'bridge_quantity_mismatch' });
      }
    }

    const currentDispensed = await dispensationRepo.getTotalDispensed(supabase, orderId);
    const targetQuantity = order.quantity_units ?? 0;
    const remainingQuantity = targetQuantity - currentDispensed;
    if (targetQuantity <= 0 || input.dispensed_quantity > remainingQuantity) {
      return fail({ code: 'dispense_quantity_exceeds_remaining' });
    }

    // Record event
    await dispensationRepo.insertDispensationEvent(supabase, {
      order_id: orderId,
      pharmacist_id: pharmacist.id,
      pharmacy_id: pharmacist.pharmacy_id,
      dispense_status: 'dispensed',
      dispensed_medication: input.dispensed_medication,
      dispensed_formulation: input.dispensed_formulation,
      dispensed_quantity: input.dispensed_quantity,
      dispensed_batch_number: input.batch_number ?? null,
      dispensed_expiry_date: input.expiry_date ?? null,
      substitution_type: input.substitution_type ?? 'none',
      substitution_reason: input.substitution_reason ?? null,
      substitution_approved_by_prescriber: input.substitution_approved_by_prescriber ?? false,
      pharmacy_notes: input.pharmacy_notes ?? null,
      dispensed_at: new Date().toISOString(),
    });

    // Calculate totals
    const totalDispensed = currentDispensed + input.dispensed_quantity;
    const newStatus = totalDispensed >= targetQuantity ? 'dispensed' : 'partially_dispensed';

    // Update statuses
    await dispensationRepo.updateOrderStatus(supabase, orderId, newStatus);

    const prescriptionStatus = newStatus === 'dispensed' ? 'dispensed_total' : 'dispensed_partial';
    await dispensationRepo.updatePrescriptionStatus(supabase, order.prescription_id, prescriptionStatus);

    // Audit
    await dispensationRepo.logAudit(supabase, {
      order_id: orderId,
      event_type: 'dispensation_executed',
      actor_id: userId,
      actor_role: 'pharmacist',
      details: {
        dispensed_quantity: input.dispensed_quantity,
        total_dispensed: totalDispensed,
        target_quantity: targetQuantity,
        new_status: newStatus,
      },
    });

    return ok({
      status: newStatus,
      total_dispensed: totalDispensed,
      target_quantity: targetQuantity,
      prescription_status_updated: prescriptionStatus,
    });
  },
};
