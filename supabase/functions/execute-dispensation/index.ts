import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { captureEdgeException, initEdgeSentry } from '../_shared/sentry.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? (() => { throw new Error('SUPABASE_URL is not set') })();
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? (() => { throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set') })();

interface ExecuteDispensationRequest {
  order_id: string;
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

initEdgeSentry('execute-dispensation');

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

    // Verify pharmacist
    const { data: pharmacist } = await supabaseAdmin
      .from('pharmacists')
      .select('id, pharmacy_id')
      .eq('user_id', user.id)
      .eq('active', true)
      .single();

    if (!pharmacist) {
      return new Response(JSON.stringify({ error: 'User is not an active pharmacist' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body: ExecuteDispensationRequest = await req.json();
    if (!body.order_id || !body.dispensed_medication || !body.dispensed_formulation || !body.dispensed_quantity) {
      return new Response(JSON.stringify({
        error: 'order_id, dispensed_medication, dispensed_formulation, and dispensed_quantity are required',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch order
    const { data: order } = await supabaseAdmin
      .from('dispensation_orders')
      .select('*')
      .eq('id', body.order_id)
      .single();

    if (!order) {
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

    const validStatuses = ['approved_for_dispensation', 'partially_dispensed'];
    if (!validStatuses.includes(order.status)) {
      return new Response(JSON.stringify({
        error: `Cannot dispense in status "${order.status}". Expected "approved_for_dispensation" or "partially_dispensed".`,
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // HARD RULE: Bridge — exact formulation and quantity match
    if (order.prescription_type === 'transition_bridge') {
      if (body.dispensed_formulation !== order.formulation) {
        return new Response(JSON.stringify({
          error: 'Bridge prescription: formulation mismatch',
          expected: order.formulation,
          received: body.dispensed_formulation,
          resolution: 'Use clarification workflow to request formulation changes on bridge prescriptions',
        }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (body.dispensed_quantity !== order.quantity_units) {
        return new Response(JSON.stringify({
          error: 'Bridge prescription: quantity mismatch',
          expected: order.quantity_units,
          received: body.dispensed_quantity,
          resolution: 'Use clarification workflow to request quantity changes on bridge prescriptions',
        }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';

    // Insert dispensation event (DB trigger will enforce substitution controls)
    const { error: eventError } = await supabaseAdmin
      .from('dispensation_events')
      .insert({
        order_id: body.order_id,
        pharmacist_id: pharmacist.id,
        pharmacy_id: pharmacist.pharmacy_id,
        dispense_status: body.substitution_type && body.substitution_type !== 'none' ? 'substituted' : 'dispensed',
        dispensed_medication: body.dispensed_medication,
        dispensed_formulation: body.dispensed_formulation,
        dispensed_quantity: body.dispensed_quantity,
        dispensed_batch_number: body.batch_number || null,
        dispensed_expiry_date: body.expiry_date || null,
        substitution_type: body.substitution_type || 'none',
        substitution_reason: body.substitution_reason || null,
        substitution_approved_by_prescriber: body.substitution_approved_by_prescriber || false,
        pharmacy_notes: body.pharmacy_notes || null,
      });

    if (eventError) {
      captureEdgeException(eventError, {
        layer: 'data-platform',
        surface: 'execute-dispensation:event-insert',
        owner: 'Pharmacy Platform',
        context: {
          orderId: body.order_id,
          substitutionType: body.substitution_type || 'none',
          dispensedQuantity: body.dispensed_quantity,
        },
      });
      console.error('[execute-dispensation] Event insert error:', eventError);
      // Check if it's a trigger enforcement error
      if (eventError.message.includes('Substitution')) {
        return new Response(JSON.stringify({
          error: 'Substitution control violation',
          details: eventError.message,
        }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'Failed to record dispensation', details: eventError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Calculate total dispensed
    const { data: allEvents } = await supabaseAdmin
      .from('dispensation_events')
      .select('dispensed_quantity')
      .eq('order_id', body.order_id);

    const totalDispensed = (allEvents || []).reduce(
      (sum: number, e: { dispensed_quantity: number }) => sum + e.dispensed_quantity, 0
    );

    const newStatus = totalDispensed >= order.quantity_units ? 'dispensed' : 'partially_dispensed';

    // Update order status
    await supabaseAdmin
      .from('dispensation_orders')
      .update({ status: newStatus })
      .eq('id', body.order_id);

    // Update original prescription status
    const rxStatus = newStatus === 'dispensed' ? 'dispensed_total' : 'dispensed_partial';
    await supabaseAdmin
      .from('prescriptions')
      .update({ status: rxStatus })
      .eq('id', order.prescription_id);

    // Audit
    await supabaseAdmin.from('pharmacy_audit_events').insert({
      order_id: body.order_id,
      event_type: 'dispensation_executed',
      actor_id: user.id,
      actor_role: 'pharmacist',
      details: {
        dispensed_medication: body.dispensed_medication,
        dispensed_formulation: body.dispensed_formulation,
        dispensed_quantity: body.dispensed_quantity,
        total_dispensed: totalDispensed,
        target_quantity: order.quantity_units,
        new_status: newStatus,
        substitution_type: body.substitution_type || 'none',
        batch_number: body.batch_number,
      },
      ip_address: ipAddress,
    });

    return new Response(JSON.stringify({
      status: newStatus,
      total_dispensed: totalDispensed,
      target_quantity: order.quantity_units,
      prescription_status_updated: rxStatus,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    captureEdgeException(error, {
      layer: 'data-platform',
      surface: 'execute-dispensation:unexpected',
      owner: 'Pharmacy Platform',
    });
    console.error('[execute-dispensation] Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
