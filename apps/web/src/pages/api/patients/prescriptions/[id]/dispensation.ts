import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { withAuthRole, PATIENT_ROLES, isAuthed } from '@/lib/api-auth';
import { jsonOk, badRequest, forbidden, notFound, internalError } from '@/lib/api-helpers';

export const GET: APIRoute = async ({ request, params, locals }) => {
  const prescriptionId = params.id;
  if (!prescriptionId) return badRequest('missing_prescription_id');

  try {
    const auth = await withAuthRole(request, PATIENT_ROLES, locals);
    if (!isAuthed(auth)) return auth;
    const { user, supabase } = auth;

    const { data: patient } = await supabase
      .from('patients')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!patient) return forbidden('not_a_patient');

    const { data: prescription } = await supabase
      .from('prescriptions')
      .select('id, status, patient_id')
      .eq('id', prescriptionId)
      .maybeSingle();

    if (!prescription) return notFound('prescription_not_found');
    if (prescription.patient_id !== patient.id) {
      return forbidden('prescription_not_yours');
    }

    const { data: order } = await supabase
      .from('dispensation_orders')
      .select(`
        id, status, prescription_type, clinical_semaphore,
        medication, formulation, quantity_units, pharmacy_id,
        dispense_window_start, dispense_window_end,
        created_at, updated_at
      `)
      .eq('prescription_id', prescriptionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!order) {
      return jsonOk({ prescription_status: prescription.status, dispensation: null, events: [] });
    }

    const [{ data: events }, pharmacyResult] = await Promise.all([
      supabase
        .from('dispensation_events')
        .select('id, dispense_status, dispensed_medication, dispensed_formulation, dispensed_quantity, substitution_type, pharmacy_notes, dispensed_at')
        .eq('order_id', order.id)
        .order('dispensed_at', { ascending: false }),
      order.pharmacy_id
        ? supabase
            .from('pharmacies')
            .select('name')
            .eq('id', order.pharmacy_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    return jsonOk({
      prescription_status: prescription.status,
      dispensation: { ...order, pharmacy_name: pharmacyResult.data?.name ?? null },
      events: events ?? [],
    });
  } catch (err) {
    logger.error('[patients/prescriptions/dispensation] GET error', err);
    return internalError();
  }
};
