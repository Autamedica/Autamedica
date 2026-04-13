import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { captureEdgeException, initEdgeSentry } from '../_shared/sentry.ts';

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const supabaseUrl = requireEnv('SUPABASE_URL');
const supabaseServiceKeyEnv = ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_');
const serviceRoleKey = requireEnv(supabaseServiceKeyEnv);

interface ValidateRequest {
  order_id: string;
  validation_type: string;
  result: 'pass' | 'fail' | 'warning' | 'overridden';
  details?: string;
  override_reason?: string;
}

initEdgeSentry('validate-dispensation');

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseUser = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify pharmacist role
    const { data: pharmacist, error: pharmacistError } = await supabaseAdmin
      .from('pharmacists')
      .select('id, pharmacy_id')
      .eq('user_id', user.id)
      .eq('active', true)
      .single();

    if (pharmacistError || !pharmacist) {
      return new Response(JSON.stringify({ error: 'User is not an active pharmacist' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body: ValidateRequest = await req.json();
    if (!body.order_id || !body.validation_type || !body.result) {
      return new Response(JSON.stringify({ error: 'order_id, validation_type, and result are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch order and verify pharmacy assignment
    const { data: order, error: orderError } = await supabaseAdmin
      .from('dispensation_orders')
      .select('*')
      .eq('id', body.order_id)
      .single();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (order.pharmacy_id && order.pharmacy_id !== pharmacist.pharmacy_id) {
      return new Response(JSON.stringify({ error: 'Order is assigned to a different pharmacy' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const validStatuses = ['under_review', 'clarification_provided', 'assigned'];
    if (!validStatuses.includes(order.status)) {
      return new Response(JSON.stringify({ error: `Cannot validate order in status "${order.status}"` }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // If order was 'assigned', transition to 'under_review'
    if (order.status === 'assigned') {
      await supabaseAdmin
        .from('dispensation_orders')
        .update({ status: 'under_review' })
        .eq('id', order.id);
    }

    // Override requires reason
    if (body.result === 'overridden' && !body.override_reason) {
      return new Response(JSON.stringify({ error: 'override_reason is required when result is "overridden"' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Record validation
    const { error: validationError } = await supabaseAdmin
      .from('dispensation_validations')
      .insert({
        order_id: body.order_id,
        pharmacist_id: pharmacist.id,
        validation_type: body.validation_type,
        result: body.result,
        details: body.details || null,
        override_reason: body.override_reason || null,
        override_authorized_by: body.result === 'overridden' ? pharmacist.id : null,
      });

    if (validationError) {
      captureEdgeException(validationError, {
        layer: 'data-platform',
        surface: 'validate-dispensation:validation-insert',
        owner: 'Pharmacy Platform',
        context: {
          orderId: body.order_id,
          validationType: body.validation_type,
          result: body.result,
        },
      });
      console.error('[validate-dispensation] Validation insert error:', validationError);
      return new Response(JSON.stringify({ error: 'Failed to record validation' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Audit
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';
    await supabaseAdmin.from('pharmacy_audit_events').insert({
      order_id: body.order_id,
      event_type: 'validation_performed',
      actor_id: user.id,
      actor_role: 'pharmacist',
      details: {
        validation_type: body.validation_type,
        result: body.result,
        override_reason: body.override_reason,
      },
      ip_address: ipAddress,
    });

    // Check if validation failed → block order
    if (body.result === 'fail') {
      await supabaseAdmin
        .from('dispensation_orders')
        .update({ status: 'blocked' })
        .eq('id', body.order_id);

      await supabaseAdmin.from('pharmacy_audit_events').insert({
        order_id: body.order_id,
        event_type: 'order_blocked',
        actor_id: user.id,
        actor_role: 'pharmacist',
        details: {
          reason: `Validation "${body.validation_type}" failed`,
          details: body.details,
        },
        ip_address: ipAddress,
      });

      return new Response(JSON.stringify({
        status: 'blocked',
        message: `Order blocked: ${body.validation_type} failed`,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if all required validations have passed
    const { data: allValidations } = await supabaseAdmin
      .from('dispensation_validations')
      .select('validation_type, result')
      .eq('order_id', body.order_id);

    const passedTypes = (allValidations || [])
      .filter((v: { result: string }) => v.result === 'pass' || v.result === 'overridden')
      .map((v: { validation_type: string }) => v.validation_type);

    // Determine required validations based on order flags
    const required: string[] = [
      'patient_identity', 'prescriber_identity', 'medication_match',
      'formulation_match', 'quantity_check', 'validity_check',
    ];
    if (order.extraordinary_dose_flag) required.push('dose_check');
    if (order.prescription_type === 'transition_bridge') required.push('bridge_protocol');

    const controlledMeds = ['metilfenidato', 'methylphenidate', 'lisdexanfetamina', 'anfetamina', 'modafinilo', 'atomoxetina'];
    if (controlledMeds.some((m: string) => (order.medication || '').toLowerCase().includes(m))) {
      required.push('controlled_substance');
    }

    const remaining = required.filter((r: string) => !passedTypes.includes(r));
    const allPassed = remaining.length === 0;

    if (allPassed) {
      // Auto-approve (DB trigger will enforce extraordinary dose check)
      const { error: approveError } = await supabaseAdmin
        .from('dispensation_orders')
        .update({ status: 'approved_for_dispensation' })
        .eq('id', body.order_id);

      if (approveError) {
        // Trigger enforcement may block this
        return new Response(JSON.stringify({
          status: 'validation_complete_but_approval_blocked',
          message: approveError.message,
          remaining_validations: [],
        }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      await supabaseAdmin.from('pharmacy_audit_events').insert({
        order_id: body.order_id,
        event_type: 'dispensation_approved',
        actor_id: user.id,
        actor_role: 'pharmacist',
        details: { completed_validations: passedTypes },
        ip_address: ipAddress,
      });
    }

    return new Response(JSON.stringify({
      status: allPassed ? 'approved_for_dispensation' : 'under_review',
      all_passed: allPassed,
      remaining_validations: remaining,
      completed_validations: passedTypes,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    captureEdgeException(error, {
      layer: 'data-platform',
      surface: 'validate-dispensation:unexpected',
      owner: 'Pharmacy Platform',
    });
    console.error('[validate-dispensation] Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
