import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { withAuthRole, PHARMACIST_ROLES, isAuthed } from '@/lib/api-auth';
import { jsonOk, badRequest, forbidden, internalError } from '@/lib/api-helpers';

/**
 * POST /api/pharmacy/orders/:id/dispense
 * Records the physical dispensation of medication.
 * Body: { dispensed_medication, dispensed_formulation, dispensed_quantity, batch_number?, expiry_date?, substitution_type?, substitution_reason?, pharmacy_notes? }
 */
export const POST: APIRoute = async ({ request, params }) => {
  const orderId = params.id;
  if (!orderId) return badRequest('missing_order_id');

  try {
    const auth = await withAuthRole(request, PHARMACIST_ROLES);
    if (!isAuthed(auth)) return auth;
    const { user, supabase } = auth;

    const { data: pharmacist } = await supabase
      .from('pharmacists')
      .select('id, pharmacy_id')
      .eq('user_id', user.id)
      .eq('active', true)
      .single();

    if (!pharmacist) return forbidden('not_a_pharmacist');

    const body = await request.json() as {
      dispensed_medication: string;
      dispensed_formulation: string;
      dispensed_quantity: number;
      batch_number?: string;
      expiry_date?: string;
      substitution_type?: string;
      substitution_reason?: string;
      substitution_approved_by_prescriber?: boolean;
      pharmacy_notes?: string;
    };

    if (!body.dispensed_medication || !body.dispensed_formulation || !body.dispensed_quantity) {
      return badRequest('missing_required_dispensation_fields');
    }

    const { data: order } = await supabase
      .from('dispensation_orders')
      .select('id, status, pharmacy_id, prescription_id, quantity_units, formulation, prescription_type')
      .eq('id', orderId)
      .single();

    if (!order || order.pharmacy_id !== pharmacist.pharmacy_id) {
      return forbidden('order_not_in_your_pharmacy');
    }

    if (!['approved_for_dispensation', 'partially_dispensed'].includes(order.status)) {
      return badRequest(`order_status_${order.status}_not_dispensable`);
    }

    // Bridge prescriptions: exact match required
    if (order.prescription_type === 'transition_bridge') {
      if (body.dispensed_formulation !== order.formulation) {
        return badRequest('bridge_formulation_must_match_exactly');
      }
      if (body.dispensed_quantity !== order.quantity_units) {
        return badRequest('bridge_quantity_must_match_exactly');
      }
    }

    // Record dispensation event
    const { error: eventError } = await supabase
      .from('dispensation_events')
      .insert({
        order_id: orderId,
        pharmacist_id: pharmacist.id,
        pharmacy_id: pharmacist.pharmacy_id,
        dispense_status: 'dispensed',
        dispensed_medication: body.dispensed_medication,
        dispensed_formulation: body.dispensed_formulation,
        dispensed_quantity: body.dispensed_quantity,
        dispensed_batch_number: body.batch_number ?? null,
        dispensed_expiry_date: body.expiry_date ?? null,
        substitution_type: body.substitution_type ?? 'none',
        substitution_reason: body.substitution_reason ?? null,
        substitution_approved_by_prescriber: body.substitution_approved_by_prescriber ?? false,
        pharmacy_notes: body.pharmacy_notes ?? null,
        dispensed_at: new Date().toISOString(),
      });

    if (eventError) {
      logger.error('[pharmacy/dispense] Event insert error', eventError);
      return internalError();
    }

    // Calculate total dispensed
    const { data: allEvents } = await supabase
      .from('dispensation_events')
      .select('dispensed_quantity')
      .eq('order_id', orderId);

    const totalDispensed = (allEvents ?? []).reduce((sum, e) => sum + (e.dispensed_quantity ?? 0), 0);
    const targetQuantity = order.quantity_units ?? 0;
    const newStatus = totalDispensed >= targetQuantity ? 'dispensed' : 'partially_dispensed';

    // Update order status
    await supabase
      .from('dispensation_orders')
      .update({ status: newStatus })
      .eq('id', orderId);

    // Update prescription status
    const prescriptionStatus = newStatus === 'dispensed' ? 'dispensed_total' : 'dispensed_partial';
    await supabase
      .from('prescriptions')
      .update({ status: prescriptionStatus })
      .eq('id', order.prescription_id);

    // Audit
    await supabase.from('pharmacy_audit_events').insert({
      order_id: orderId,
      event_type: 'dispensation_executed',
      actor_id: user.id,
      actor_role: 'pharmacist',
      details: {
        dispensed_quantity: body.dispensed_quantity,
        total_dispensed: totalDispensed,
        target_quantity: targetQuantity,
        new_status: newStatus,
      },
    });

    return jsonOk({
      status: newStatus,
      total_dispensed: totalDispensed,
      target_quantity: targetQuantity,
      prescription_status_updated: prescriptionStatus,
    });
  } catch (err) {
    logger.error('[pharmacy/dispense] POST error', err);
    return internalError();
  }
};
