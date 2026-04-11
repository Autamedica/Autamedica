import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { withAuthRole, PATIENT_ROLES, isAuthed } from '@/lib/api-auth';
import { jsonOk, badRequest, forbidden, internalError } from '@/lib/api-helpers';

/**
 * GET /api/patients/prescriptions/:id/dispensation
 * Returns the dispensation status and events for a patient's prescription.
 */
export const GET: APIRoute = async ({ request, params }) => {
  const prescriptionId = params.id;
  if (!prescriptionId) return badRequest('missing_prescription_id');

  try {
    const auth = await withAuthRole(request, PATIENT_ROLES);
    if (!isAuthed(auth)) return auth;
    const { user, supabase } = auth;

    // Verify the prescription belongs to this patient
    const { data: patient } = await supabase
      .from('patients')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!patient) return forbidden('not_a_patient');

    const { data: prescription } = await supabase
      .from('prescriptions')
      .select('id, status, patient_id')
      .eq('id', prescriptionId)
      .single();

    if (!prescription?.patient_id || prescription.patient_id !== patient.id) {
      return forbidden('prescription_not_yours');
    }

    // Get dispensation order
    const { data: order } = await supabase
      .from('dispensation_orders')
      .select(`
        id, status, prescription_type, clinical_semaphore,
        medication, formulation, quantity_units,
        dispense_window_start, dispense_window_end,
        created_at, updated_at
      `)
      .eq('prescription_id', prescriptionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!order) {
      return jsonOk({
        prescription_status: prescription.status,
        dispensation: null,
        events: [],
      });
    }

    // Get dispensation events
    const { data: events } = await supabase
      .from('dispensation_events')
      .select(`
        id, dispense_status,
        dispensed_medication, dispensed_formulation, dispensed_quantity,
        substitution_type, pharmacy_notes,
        dispensed_at
      `)
      .eq('order_id', order.id)
      .order('dispensed_at', { ascending: false });

    // Get pharmacy info
    const { data: pharmacyInfo } = await supabase
      .from('dispensation_orders')
      .select('pharmacy_id')
      .eq('id', order.id)
      .single();

    let pharmacyName: string | null = null;
    if (pharmacyInfo?.pharmacy_id) {
      const { data: pharmacy } = await supabase
        .from('pharmacies')
        .select('name')
        .eq('id', pharmacyInfo.pharmacy_id)
        .single();
      pharmacyName = pharmacy?.name ?? null;
    }

    return jsonOk({
      prescription_status: prescription.status,
      dispensation: {
        ...order,
        pharmacy_name: pharmacyName,
      },
      events: events ?? [],
    });
  } catch (err) {
    logger.error('[patients/prescriptions/dispensation] GET error', err);
    return internalError();
  }
};
