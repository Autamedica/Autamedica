/**
 * Repository: Dispensation data access layer.
 * Only this file talks to Supabase for pharmacy dispensation tables.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@autamedica/shared';

type Client = SupabaseClient;

export interface PharmacistRecord {
  id: string;
  pharmacy_id: string;
}

export interface DispensationOrderRow {
  id: string;
  prescription_id: string;
  patient_id: string;
  doctor_id: string;
  pharmacy_id: string | null;
  medication: string | null;
  formulation: string | null;
  dose_mg_per_day: number | null;
  quantity_units: number | null;
  duration_days: number | null;
  prescription_type: string;
  status: string;
  clinical_semaphore: string | null;
  semaphore_reasons: string[] | null;
  extraordinary_dose_flag: boolean;
  requires_clarification: boolean;
  dispense_window_start: string | null;
  dispense_window_end: string | null;
  created_at: string;
  updated_at: string;
}

export const dispensationRepo = {
  async findPharmacist(supabase: Client, userId: string): Promise<PharmacistRecord | null> {
    const { data } = await supabase
      .from('pharmacists')
      .select('id, pharmacy_id')
      .eq('user_id', userId)
      .eq('active', true)
      .single();
    return data;
  },

  async listOrdersByPharmacy(
    supabase: Client,
    pharmacyId: string,
    statusFilter: string[],
    limit: number,
  ): Promise<DispensationOrderRow[]> {
    let query = supabase
      .from('dispensation_orders')
      .select(`
        id, prescription_id, patient_id, doctor_id, pharmacy_id,
        medication, formulation, dose_mg_per_day, quantity_units, duration_days,
        prescription_type, status, clinical_semaphore, semaphore_reasons,
        extraordinary_dose_flag, requires_clarification,
        dispense_window_start, dispense_window_end,
        created_at, updated_at
      `)
      .eq('pharmacy_id', pharmacyId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (statusFilter.length > 0) {
      query = query.in('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) {
      logger.error('[dispensationRepo] listOrders error', error);
      throw error;
    }
    return data ?? [];
  },

  async listUnassignedOrders(
    supabase: Client,
    limit: number,
  ): Promise<DispensationOrderRow[]> {
    const { data, error } = await supabase
      .from('dispensation_orders')
      .select(`
        id, prescription_id, patient_id, doctor_id, pharmacy_id,
        medication, formulation, dose_mg_per_day, quantity_units, duration_days,
        prescription_type, status, clinical_semaphore, semaphore_reasons,
        extraordinary_dose_flag, requires_clarification,
        dispense_window_start, dispense_window_end,
        created_at, updated_at
      `)
      .is('pharmacy_id', null)
      .eq('status', 'pending')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) {
      logger.error('[dispensationRepo] listUnassignedOrders error', error);
      throw error;
    }
    return data ?? [];
  },

  async claimOrder(
    supabase: Client,
    orderId: string,
    pharmacyId: string,
  ): Promise<void> {
    const { error } = await supabase
      .from('dispensation_orders')
      .update({ pharmacy_id: pharmacyId, status: 'assigned' })
      .eq('id', orderId)
      .is('pharmacy_id', null)
      .eq('status', 'pending');
    if (error) {
      logger.error('[dispensationRepo] claimOrder error', { orderId, pharmacyId, error });
      throw error;
    }
  },

  async findOrderById(
    supabase: Client,
    orderId: string,
  ): Promise<DispensationOrderRow | null> {
    const { data } = await supabase
      .from('dispensation_orders')
      .select(`
        id, prescription_id, patient_id, doctor_id, pharmacy_id,
        medication, formulation, dose_mg_per_day, quantity_units, duration_days,
        prescription_type, status, clinical_semaphore, semaphore_reasons,
        extraordinary_dose_flag, requires_clarification,
        dispense_window_start, dispense_window_end,
        created_at, updated_at
      `)
      .eq('id', orderId)
      .single();
    return data;
  },

  async updateOrderStatus(supabase: Client, orderId: string, status: string): Promise<void> {
    const { error } = await supabase
      .from('dispensation_orders')
      .update({ status })
      .eq('id', orderId);
    if (error) {
      logger.error('[dispensationRepo] updateOrderStatus error', { orderId, status, error });
      throw error;
    }
  },

  async insertValidation(
    supabase: Client,
    data: {
      order_id: string;
      pharmacist_id: string;
      validation_type: string;
      result: string;
      details: string | null;
      override_reason: string | null;
      override_authorized_by: string | null;
    },
  ): Promise<void> {
    const { error } = await supabase.from('dispensation_validations').insert(data);
    if (error) {
      logger.error('[dispensationRepo] insertValidation error', error);
      throw error;
    }
  },

  async getValidationsForOrder(
    supabase: Client,
    orderId: string,
  ): Promise<Array<{ validation_type: string; result: string }>> {
    const { data } = await supabase
      .from('dispensation_validations')
      .select('validation_type, result')
      .eq('order_id', orderId);
    return data ?? [];
  },

  async insertDispensationEvent(
    supabase: Client,
    data: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await supabase.from('dispensation_events').insert(data);
    if (error) {
      logger.error('[dispensationRepo] insertEvent error', error);
      throw error;
    }
  },

  async getTotalDispensed(supabase: Client, orderId: string): Promise<number> {
    const { data } = await supabase
      .from('dispensation_events')
      .select('dispensed_quantity')
      .eq('order_id', orderId);
    return (data ?? []).reduce((sum, e) => sum + (e.dispensed_quantity ?? 0), 0);
  },

  async updatePrescriptionStatus(supabase: Client, prescriptionId: string, status: string): Promise<void> {
    const { error } = await supabase
      .from('prescriptions')
      .update({ status })
      .eq('id', prescriptionId);
    if (error) {
      logger.error('[dispensationRepo] updatePrescriptionStatus error', { prescriptionId, status, error });
    }
  },

  async logAudit(
    supabase: Client,
    data: {
      order_id: string;
      event_type: string;
      actor_id: string;
      actor_role: string;
      details: Record<string, unknown>;
    },
  ): Promise<void> {
    await supabase.from('pharmacy_audit_events').insert(data).then(({ error }) => {
      if (error) logger.warn('[dispensationRepo] audit log error (non-blocking)', error);
    });
  },
};
