import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { captureEdgeException, initEdgeSentry } from '../_shared/sentry.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? (() => { throw new Error('SUPABASE_URL is not set') })();
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? (() => { throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set') })();

interface CreateOrderRequest {
  prescription_id: string;
}

initEdgeSentry('create-dispensation-order');

Deno.serve(async (req) => {
  try {
    // Auth verification
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

    const body: CreateOrderRequest = await req.json();
    if (!body.prescription_id) {
      return new Response(JSON.stringify({ error: 'prescription_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Fetch the prescription
    const { data: prescription, error: rxError } = await supabaseAdmin
      .from('prescriptions')
      .select('*')
      .eq('id', body.prescription_id)
      .single();

    if (rxError || !prescription) {
      return new Response(JSON.stringify({ error: 'Prescription not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (prescription.status !== 'signed') {
      return new Response(JSON.stringify({ error: `Prescription status is "${prescription.status}", expected "signed"` }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Extract clinical data from the prescription
    const clinicalData = prescription.clinical_data || {};
    const items = clinicalData.items || [];
    const firstItem = items[0] || {};

    // 3. Check for associated psychiatry intake (for semaphore/bridge flags)
    let prescriptionType = 'standard';
    let extraordinaryDoseFlag = false;
    let clinicalSemaphore = 'green';
    let semaphoreReasons: string[] = [];

    const { data: intake } = await supabaseAdmin
      .from('psychiatry_intakes')
      .select('*')
      .eq('patient_id', prescription.patient_id)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (intake) {
      // Extract intake-derived flags from sections_status
      const sectionsStatus = intake.sections_status || {};
      if (sectionsStatus.prescription_type) {
        prescriptionType = sectionsStatus.prescription_type;
      }
      if (sectionsStatus.extraordinary_dose) {
        extraordinaryDoseFlag = true;
      }
      if (sectionsStatus.semaphore) {
        clinicalSemaphore = sectionsStatus.semaphore;
      }
      if (sectionsStatus.semaphore_reasons) {
        semaphoreReasons = sectionsStatus.semaphore_reasons;
      }
    }

    // 4. Determine initial status
    const initialStatus = clinicalSemaphore === 'red' ? 'blocked' : 'pending';

    // 5. Calculate dispensation window (7 days for bridge, 30 for standard)
    const now = new Date();
    const durationDays = prescriptionType === 'transition_bridge' ? 7 : 30;
    const windowEnd = new Date(now);
    windowEnd.setDate(windowEnd.getDate() + durationDays);

    // 6. Insert dispensation order
    const orderData = {
      prescription_id: prescription.id,
      patient_id: prescription.patient_id,
      doctor_id: prescription.doctor_id,
      prescription_type: prescriptionType,
      medication: firstItem.genericName || firstItem.generic_name || 'Unknown',
      formulation: firstItem.presentation || 'Unknown',
      dose_mg_per_day: parseFloat(firstItem.dosage) || 0,
      quantity_units: firstItem.quantity || 0,
      duration_days: durationDays,
      clinician_decision: 'approved',
      requires_clarification: false,
      extraordinary_dose_flag: extraordinaryDoseFlag,
      prescriber_verified: true,
      reconciliation_status: 'reconciled',
      clinical_semaphore: clinicalSemaphore,
      semaphore_reasons: semaphoreReasons,
      dispense_window_start: now.toISOString().split('T')[0],
      dispense_window_end: windowEnd.toISOString().split('T')[0],
      status: initialStatus,
      prescriber_notes: clinicalData.notes || null,
    };

    const { data: order, error: insertError } = await supabaseAdmin
      .from('dispensation_orders')
      .insert(orderData)
      .select('id')
      .single();

    if (insertError) {
      captureEdgeException(insertError, {
        layer: 'data-platform',
        surface: 'create-dispensation-order:insert',
        owner: 'Supabase Platform',
        context: {
          prescriptionId: prescription.id,
          patientId: prescription.patient_id,
          doctorId: prescription.doctor_id,
        },
      });
      console.error('[create-dispensation-order] Insert error:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to create dispensation order', details: insertError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 7. Log audit events
    const auditBase = {
      order_id: order.id,
      actor_id: user.id,
      actor_role: 'system',
      ip_address: req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown',
    };

    await supabaseAdmin.from('pharmacy_audit_events').insert({
      ...auditBase,
      event_type: 'order_created',
      details: {
        prescription_id: prescription.id,
        prescription_type: prescriptionType,
        clinical_semaphore: clinicalSemaphore,
        extraordinary_dose_flag: extraordinaryDoseFlag,
        initial_status: initialStatus,
      },
    });

    if (prescriptionType === 'transition_bridge') {
      await supabaseAdmin.from('pharmacy_audit_events').insert({
        ...auditBase,
        event_type: 'bridge_protocol_activated',
        details: { duration_days: durationDays, quantity_units: orderData.quantity_units },
      });
    }

    if (extraordinaryDoseFlag) {
      await supabaseAdmin.from('pharmacy_audit_events').insert({
        ...auditBase,
        event_type: 'extraordinary_dose_flagged',
        details: { dose_mg_per_day: orderData.dose_mg_per_day, medication: orderData.medication },
      });
    }

    return new Response(JSON.stringify({
      id: order.id,
      status: initialStatus,
      prescription_type: prescriptionType,
      clinical_semaphore: clinicalSemaphore,
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    captureEdgeException(error, {
      layer: 'data-platform',
      surface: 'create-dispensation-order:unexpected',
      owner: 'Supabase Platform',
    });
    console.error('[create-dispensation-order] Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
