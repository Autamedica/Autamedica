import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'

interface CreatePaymentBody {
  appointmentId?: string
}

interface DoctorRow {
  id: string
  consultation_fee: number | string | null
  payout_cbu: string | null
  payout_alias: string | null
}

interface AppointmentRow {
  id: string
  patient_id: string
  doctor_id: string | null
  status: string
  doctor?: DoctorRow | DoctorRow[] | null
}

interface WalletBalanceRow {
  patient_id: string
  available_credit_cents: number | string
  locked_credit_cents: number | string
  total_credit_cents: number | string
  currency: string
}

interface WalletPayResultRow {
  success: boolean
  message?: string
  appointment_payment_id?: string
  ledger_id?: string
  amount_cents?: number
  new_available_credit_cents?: number
}

export async function handler(req: Request): Promise<Response> {
  // Implementation

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  try {
    // 1. Verify Authorization Header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      console.error('[create-appointment-payment] Missing Supabase environment variables')
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    })

    const token = authHeader.replace(/^Bearer\s+/i, '')
    const { data: authData, error: authError } = await supabaseUser.auth.getUser(token)

    if (authError || !authData.user) {
      console.error('[create-appointment-payment] JWT verification error:', authError)
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const user = authData.user

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 2. Fetch patient record for this user
    const { data: patient, error: patientError } = await supabaseAdmin
      .from('patients')
      .select('id, user_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (patientError || !patient || patient.user_id !== user.id) {
      console.error('[create-appointment-payment] Patient lookup failed:', {
        userId: user.id,
        patientError,
      })
      return new Response(
        JSON.stringify({ error: 'Forbidden: patient profile not found for authenticated user' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // 3. Parse request body
    let body: CreatePaymentBody
    try {
      body = await req.json() as CreatePaymentBody
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const appointmentId = body?.appointmentId
    if (!appointmentId || typeof appointmentId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing required field: appointmentId' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // 4. Fetch appointment and doctor details
    const { data: appointmentData, error: appointmentError } = await supabaseAdmin
      .from('appointments')
      .select(`
        id,
        patient_id,
        doctor_id,
        status,
        doctor:doctors!appointments_doctor_id_fkey (
          id,
          consultation_fee,
          payout_cbu,
          payout_alias
        )
      `)
      .eq('id', appointmentId)
      .maybeSingle()

    if (appointmentError) {
      console.error('[create-appointment-payment] Appointment lookup failed:', appointmentError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch appointment', details: appointmentError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (!appointmentData) {
      return new Response(
        JSON.stringify({ error: 'Appointment not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const appointment = appointmentData as unknown as AppointmentRow

    if (appointment.patient_id !== patient.id) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: appointment does not belong to the patient' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (!appointment.doctor_id) {
      return new Response(
        JSON.stringify({ error: 'Appointment does not have an assigned doctor' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Resolve doctor record
    let doctor: DoctorRow | null = null
    if (Array.isArray(appointment.doctor) && appointment.doctor.length > 0) {
      doctor = appointment.doctor[0]
    } else if (appointment.doctor && !Array.isArray(appointment.doctor)) {
      doctor = appointment.doctor
    }

    if (!doctor) {
      const { data: directDoctor, error: directDoctorError } = await supabaseAdmin
        .from('doctors')
        .select('id, consultation_fee, payout_cbu, payout_alias')
        .eq('id', appointment.doctor_id)
        .maybeSingle()

      if (directDoctorError || !directDoctor) {
        console.error('[create-appointment-payment] Direct doctor lookup failed:', directDoctorError)
        return new Response(
          JSON.stringify({ error: 'Doctor not found for appointment' }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }
      doctor = directDoctor as DoctorRow
    }

    // 5. Check if appointment already has payment
    const { data: existingPayment, error: paymentLookupError } = await supabaseAdmin
      .from('appointment_payments')
      .select('id, status, checkout_url, provider_preference_id, gross_amount')
      .eq('appointment_id', appointmentId)
      .maybeSingle()

    if (paymentLookupError) {
      console.error('[create-appointment-payment] Existing payment check failed:', paymentLookupError)
      return new Response(
        JSON.stringify({ error: 'Failed to verify existing payment', details: paymentLookupError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (existingPayment) {
      if (existingPayment.status === 'approved') {
        return new Response(
          JSON.stringify({
            ok: true,
            status: 'approved',
            appointment_payment_id: existingPayment.id,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      if (existingPayment.status === 'pending' && existingPayment.checkout_url) {
        return new Response(
          JSON.stringify({
            ok: true,
            status: 'pending',
            payment_source: 'mercadopago',
            checkout_url: existingPayment.checkout_url,
            preference_id: existingPayment.provider_preference_id,
            appointment_payment_id: existingPayment.id,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // 6. Calculate fee amount in cents
    const amountCents = Math.round(Number(doctor.consultation_fee ?? 0))
    if (amountCents <= 0) {
      return new Response(
        JSON.stringify({ error: 'Doctor consultation fee must be greater than zero' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // 7. Check patient wallet balance
    const { data: walletRows, error: walletError } = await supabaseAdmin
      .rpc('patient_wallet_get_balance', { p_patient_id: patient.id })

    if (walletError) {
      console.error('[create-appointment-payment] Wallet balance RPC error:', walletError)
    }

    const walletBalance = Array.isArray(walletRows)
      ? (walletRows[0] as WalletBalanceRow | undefined)
      : (walletRows as WalletBalanceRow | null)
    const availableCreditCents = Number(walletBalance?.available_credit_cents ?? 0)

    // 8. If wallet covers the amount, pay with wallet
    if (availableCreditCents >= amountCents) {
      const { data: walletPayRows, error: walletPayError } = await supabaseAdmin
        .rpc('pay_appointment_with_patient_wallet', {
          p_appointment_id: appointmentId,
          p_patient_id: patient.id,
          p_idempotency_key: `patient_wallet_payment:${appointmentId}`,
        })

      if (walletPayError) {
        console.error('[create-appointment-payment] pay_appointment_with_patient_wallet failed:', walletPayError)
        return new Response(
          JSON.stringify({ error: 'Failed to process wallet payment', details: walletPayError.message }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      const walletPayResult = Array.isArray(walletPayRows)
        ? (walletPayRows[0] as WalletPayResultRow | undefined)
        : (walletPayRows as WalletPayResultRow | null)

      if (walletPayResult?.success && walletPayResult.appointment_payment_id) {
        // Update appointment status to confirmed
        const { error: updateApptError } = await supabaseAdmin
          .from('appointments')
          .update({
            status: 'confirmed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', appointmentId)

        if (updateApptError) {
          console.warn('[create-appointment-payment] Failed to update appointment status to confirmed:', updateApptError)
        }

        return new Response(
          JSON.stringify({
            ok: true,
            status: 'approved',
            payment_source: 'patient_wallet',
            appointment_payment_id: walletPayResult.appointment_payment_id,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      console.warn('[create-appointment-payment] Wallet payment returned unsuccess:', walletPayResult)
    }

    // 9. Wallet insufficient: create preference in MercadoPago
    const mpAccessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')
    if (!mpAccessToken) {
      console.error('[create-appointment-payment] MERCADOPAGO_ACCESS_TOKEN is missing')
      return new Response(
        JSON.stringify({ error: 'MercadoPago access token is not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const mpPayload = {
      items: [
        {
          title: 'AutaMedica - Consulta medica',
          quantity: 1,
          unit_price: amountCents / 100,
          currency_id: 'ARS',
        },
      ],
      back_urls: {
        success: `https://www.autamedica.com/patients/appointments?payment=success&appointmentId=${appointmentId}`,
        failure: `https://www.autamedica.com/patients/appointments?payment=failure&appointmentId=${appointmentId}`,
        pending: `https://www.autamedica.com/patients/appointments?payment=pending&appointmentId=${appointmentId}`,
      },
      auto_return: 'approved',
      statement_descriptor: 'AUTAMEDICA',
      external_reference: appointmentId,
      notification_url: 'https://www.autamedica.com/api/payments/mercadopago/webhook',
      metadata: {
        appointment_id: appointmentId,
        patient_id: patient.id,
        doctor_id: appointment.doctor_id,
      },
    }

    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mpAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mpPayload),
    })

    if (!mpResponse.ok) {
      const errorText = await mpResponse.text()
      console.error('[create-appointment-payment] MercadoPago API error:', mpResponse.status, errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to create MercadoPago preference', details: errorText }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const mpData = await mpResponse.json() as {
      id: string
      init_point: string
    }

    // 10. Upsert appointment_payments record
    const { error: upsertError } = await supabaseAdmin
      .from('appointment_payments')
      .upsert(
        {
          appointment_id: appointmentId,
          patient_id: patient.id,
          doctor_id: appointment.doctor_id,
          gross_amount: amountCents,
          currency: 'ARS',
          status: 'pending',
          provider: 'mercadopago',
          provider_preference_id: mpData.id,
          checkout_url: mpData.init_point,
          metadata: {
            appointment_id: appointmentId,
            patient_id: patient.id,
            doctor_id: appointment.doctor_id,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'appointment_id' }
      )

    if (upsertError) {
      console.error('[create-appointment-payment] Failed to upsert payment record:', upsertError)
      return new Response(
        JSON.stringify({ error: 'Failed to save appointment payment', details: upsertError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // 11. Update appointment status to payment_pending
    const { error: updateApptError } = await supabaseAdmin
      .from('appointments')
      .update({
        status: 'payment_pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', appointmentId)

    if (updateApptError) {
      console.warn('[create-appointment-payment] Failed to update appointment status to payment_pending:', updateApptError)
    }

    return new Response(
      JSON.stringify({
        ok: true,
        status: 'pending',
        payment_source: 'mercadopago',
        checkout_url: mpData.init_point,
        preference_id: mpData.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (err) {
    console.error('[create-appointment-payment] Unexpected error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
};

Deno.serve(handler);
