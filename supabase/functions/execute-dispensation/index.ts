import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { captureEdgeException, initEdgeSentry } from '../_shared/sentry.ts';
import { verifyPharmacyOrderAccess, pharmacyErrorCode } from '../_shared/pharmacy-country.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? (() => { throw new Error('SUPABASE_URL is not set') })();
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? (() => { throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set') })();

interface ExecuteDispensationRequest {
  idempotency_key: string;
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
      .select('id, pharmacy_id, care_country, role, license_number')
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

    const accessError = await verifyPharmacyOrderAccess(supabaseAdmin, order, pharmacist);
    if (accessError) {
      return new Response(JSON.stringify({ error: accessError }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.idempotency_key ?? '') ||
        !Number.isSafeInteger(body.dispensed_quantity) || body.dispensed_quantity <= 0) {
      return new Response(JSON.stringify({ error: 'valid_idempotency_key_and_positive_integer_quantity_required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    const event = {
      id: body.idempotency_key, order_id: body.order_id,
      pharmacist_id: pharmacist.id, pharmacy_id: pharmacist.pharmacy_id,
      dispense_status: 'dispensed', dispensed_medication: body.dispensed_medication,
      dispensed_formulation: body.dispensed_formulation, dispensed_quantity: body.dispensed_quantity,
      dispensed_batch_number: body.batch_number ?? null, dispensed_expiry_date: body.expiry_date ?? null,
      substitution_type: body.substitution_type ?? 'none', substitution_reason: body.substitution_reason ?? null,
      substitution_approved_by_prescriber: body.substitution_approved_by_prescriber ?? false,
      pharmacy_notes: body.pharmacy_notes ?? null,
    };
    const previous = await supabaseUser.from('dispensation_events').select('*').eq('id', event.id).maybeSingle();
    if (previous.error) throw previous.error;
    let existing = previous.data;
    if (!existing) {
      // One PostgreSQL transaction enforces eligibility and commits the delivery,
      // order state, prescription state and audit; no follow-up status writes.
      const inserted = await supabaseUser.from('dispensation_events').insert(event);
      if (inserted.error) {
        if (inserted.error.code !== '23505') {
          return new Response(JSON.stringify({ error: 'dispensation_rejected' }), {
            status: ['23514', '42501'].includes(inserted.error.code) ? 409 : 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        const retry = await supabaseUser.from('dispensation_events').select('*').eq('id', event.id).maybeSingle();
        if (retry.error || !retry.data) throw retry.error ?? new Error('idempotency_record_unavailable');
        existing = retry.data;
      }
    }
    const storedEvent = existing;
    if (storedEvent && Object.entries(event).some(([key, value]) => storedEvent[key] !== value)) {
      return new Response(JSON.stringify({ error: 'idempotency_conflict' }), {
        status: 409, headers: { 'Content-Type': 'application/json' },
      });
    }
    const [updated, events] = await Promise.all([
      supabaseUser.from('dispensation_orders').select('status, quantity_units').eq('id', body.order_id).single(),
      supabaseUser.from('dispensation_events').select('dispensed_quantity').eq('order_id', body.order_id),
    ]);
    if (updated.error || events.error || !updated.data || !['dispensed', 'partially_dispensed'].includes(updated.data.status)) {
      throw new Error('dispensation_commit_not_verified');
    }
    return new Response(JSON.stringify({
      status: updated.data.status,
      total_dispensed: (events.data ?? []).reduce((sum, e) => sum + e.dispensed_quantity, 0),
      target_quantity: updated.data.quantity_units,
      prescription_status_updated: updated.data.status === 'dispensed' ? 'dispensed_total' : 'dispensed_partial',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    captureEdgeException(new Error('pharmacy_operation_failed'), {
      layer: 'data-platform',
      surface: 'execute-dispensation:unexpected',
      owner: 'Pharmacy Platform',
    });
    console.error('[execute-dispensation] Unexpected error:', { code: pharmacyErrorCode(error) });
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

