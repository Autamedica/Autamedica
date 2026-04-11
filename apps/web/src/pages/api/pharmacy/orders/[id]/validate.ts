import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { withAuthRole, PHARMACIST_ROLES, isAuthed } from '@/lib/api-auth';
import { jsonOk, badRequest, forbidden, internalError } from '@/lib/api-helpers';

/**
 * POST /api/pharmacy/orders/:id/validate
 * Records a validation check for a dispensation order.
 * Body: { validation_type, result, details?, override_reason? }
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
      validation_type: string;
      result: string;
      details?: string;
      override_reason?: string;
    };

    if (!body.validation_type || !body.result) {
      return badRequest('missing_validation_type_or_result');
    }

    if (body.result === 'overridden' && !body.override_reason) {
      return badRequest('override_requires_reason');
    }

    // Verify order belongs to pharmacist's pharmacy
    const { data: order } = await supabase
      .from('dispensation_orders')
      .select('id, status, pharmacy_id')
      .eq('id', orderId)
      .single();

    if (!order || order.pharmacy_id !== pharmacist.pharmacy_id) {
      return forbidden('order_not_in_your_pharmacy');
    }

    const validStatuses = ['assigned', 'under_review', 'clarification_provided'];
    if (!validStatuses.includes(order.status)) {
      return badRequest(`order_status_${order.status}_not_validatable`);
    }

    // Transition to under_review if currently assigned
    if (order.status === 'assigned') {
      await supabase
        .from('dispensation_orders')
        .update({ status: 'under_review' })
        .eq('id', orderId);
    }

    // Insert validation
    const { error: valError } = await supabase
      .from('dispensation_validations')
      .insert({
        order_id: orderId,
        pharmacist_id: pharmacist.id,
        validation_type: body.validation_type,
        result: body.result,
        details: body.details ?? null,
        override_reason: body.override_reason ?? null,
        override_authorized_by: body.result === 'overridden' ? pharmacist.id : null,
      });

    if (valError) {
      logger.error('[pharmacy/validate] Insert error', valError);
      return internalError();
    }

    // Log audit
    await supabase.from('pharmacy_audit_events').insert({
      order_id: orderId,
      event_type: 'validation_performed',
      actor_id: user.id,
      actor_role: 'pharmacist',
      details: { validation_type: body.validation_type, result: body.result },
    });

    // Check if validation failed → block
    if (body.result === 'fail') {
      await supabase
        .from('dispensation_orders')
        .update({ status: 'blocked' })
        .eq('id', orderId);

      await supabase.from('pharmacy_audit_events').insert({
        order_id: orderId,
        event_type: 'order_blocked',
        actor_id: user.id,
        actor_role: 'pharmacist',
        details: { reason: `validation_failed:${body.validation_type}` },
      });

      return jsonOk({ status: 'blocked', all_passed: false });
    }

    // Check if all required validations passed
    const { data: allValidations } = await supabase
      .from('dispensation_validations')
      .select('validation_type, result')
      .eq('order_id', orderId);

    const passed = (allValidations ?? []).filter(
      v => v.result === 'pass' || v.result === 'overridden'
    );
    const passedTypes = new Set(passed.map(v => v.validation_type));

    // Determine required validations
    const baseRequired = [
      'patient_identity', 'prescriber_identity', 'medication_match',
      'formulation_match', 'quantity_check', 'validity_check',
    ];

    const { data: fullOrder } = await supabase
      .from('dispensation_orders')
      .select('extraordinary_dose_flag, prescription_type')
      .eq('id', orderId)
      .single();

    if (fullOrder?.extraordinary_dose_flag) baseRequired.push('dose_check');
    if (fullOrder?.prescription_type === 'transition_bridge') baseRequired.push('bridge_protocol');

    const allPassed = baseRequired.every(r => passedTypes.has(r));

    if (allPassed) {
      await supabase
        .from('dispensation_orders')
        .update({ status: 'approved_for_dispensation' })
        .eq('id', orderId);

      await supabase.from('pharmacy_audit_events').insert({
        order_id: orderId,
        event_type: 'dispensation_approved',
        actor_id: user.id,
        actor_role: 'pharmacist',
        details: { validations_completed: baseRequired.length },
      });
    }

    return jsonOk({
      status: allPassed ? 'approved_for_dispensation' : 'under_review',
      all_passed: allPassed,
      completed: [...passedTypes],
      remaining: baseRequired.filter(r => !passedTypes.has(r)),
    });
  } catch (err) {
    logger.error('[pharmacy/validate] POST error', err);
    return internalError();
  }
};
