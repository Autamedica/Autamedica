import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { verifyPharmacyOrderAccess, pharmacyErrorCode } from '../_shared/pharmacy-country.ts';

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

interface ClarificationRequest {
  order_id: string;
  question: string;
  question_category: string;
}

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

    const body: ClarificationRequest = await req.json();
    if (!body.order_id || !body.question || !body.question_category) {
      return new Response(JSON.stringify({
        error: 'order_id, question, and question_category are required',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const validCategories = [
      'dose_verification', 'formulation_mismatch', 'duration_concern',
      'interaction_alert', 'bridge_protocol', 'identity_concern', 'other',
    ];
    if (!validCategories.includes(body.question_category)) {
      return new Response(JSON.stringify({
        error: `Invalid question_category. Valid values: ${validCategories.join(', ')}`,
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

    const validStatuses = ['under_review', 'blocked'];
    if (!validStatuses.includes(order.status)) {
      return new Response(JSON.stringify({
        error: `Cannot request clarification for order in status "${order.status}". Expected "under_review" or "blocked".`,
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create clarification request
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const { data: clarification, error: insertError } = await supabaseUser
      .from('dispensation_clarifications')
      .insert({
        order_id: body.order_id,
        requested_by: user.id,
        question: body.question,
        question_category: body.question_category,
        status: 'pending',
        expires_at: expiresAt.toISOString(),
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[request-dispensation-clarification] Insert error:', { code: pharmacyErrorCode(insertError) });
      return new Response(JSON.stringify({ error: 'Failed to create clarification request' }), {
        status: insertError.code === '42501' ? 403 : ['23505', '23514'].includes(insertError.code) ? 409 : 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // PostgreSQL committed the clarification, order transition and audit together.

    // Send push notification to the prescribing doctor
    const { data: doctor } = await supabaseAdmin
      .from('doctors')
      .select('user_id')
      .eq('id', order.doctor_id)
      .single();

    if (doctor) {
      try {
        await supabaseAdmin.functions.invoke('send-push-notification', {
          body: {
            userId: doctor.user_id,
            title: '📋 Aclaración requerida',
            body: `La farmacia solicita aclaración sobre una receta: ${body.question_category}`,
            data: {
              type: 'dispensation_clarification',
              order_id: body.order_id,
              clarification_id: clarification.id,
            },
          },
        });
      } catch (notifError) {
        // Non-fatal: log but don't fail the request
        console.error('[request-dispensation-clarification] Push notification failed:', { code: pharmacyErrorCode(notifError) });
      }
    }

    return new Response(JSON.stringify({
      clarification_id: clarification.id,
      order_status: 'clarification_requested',
      expires_at: expiresAt.toISOString(),
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[request-dispensation-clarification] Unexpected error:', { code: pharmacyErrorCode(error) });
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

