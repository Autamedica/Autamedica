import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'
import { resolveBillingCurrency } from '../_shared/billing-currency.ts'
import { getMercadoPagoMarketToken } from '../_shared/mercadopago-market-token.ts'

interface TopupRequestBody {
  amount?: unknown
}

interface PatientRow {
  id: string
  cpf?: string | null
  dni?: string | null
}

interface ProfileRow {
  email: string | null
  role: string | null
}

interface MercadoPagoPreferenceResponse {
  id: string
  init_point: string
}

export async function handler(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Only allow POST
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
      console.error('[patients-wallet-topup] Missing Supabase environment variables')
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
      console.error('[patients-wallet-topup] JWT verification error:', authError)
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const user = authData.user

    // 2. Parse and validate request body
    let body: TopupRequestBody
    try {
      body = await req.json() as TopupRequestBody
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const amount = Number(body?.amount)
    if (isNaN(amount) || amount <= 0) {
      return new Response(
        JSON.stringify({ error: 'invalid_amount' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const amountCents = Math.round(amount * 100)

    // 3. Database operations using supabaseAdmin
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // The database profile is the authorization source. Never use user_metadata
    // or a client-selected role to authorize patient wallet enrollment.
    const { data: roleProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('email, role')
      .eq('user_id', user.id)
      .maybeSingle<ProfileRow>()

    if (profileError || roleProfile?.role !== 'patient') {
      return new Response(JSON.stringify({ error: 'Forbidden: patient role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch patient row
    let { data: patient, error: patientError } = await supabaseAdmin
      .from('patients')
      .select('id, cpf, dni')
      .eq('user_id', user.id)
      .maybeSingle<PatientRow>()

    // Database role was verified before patient record creation.
    if (!patient && !patientError) {
      const { data: insertedPatient, error: insertError } = await supabaseAdmin
        .from('patients')
        .upsert({ user_id: user.id, active: true }, { onConflict: 'user_id' })
        .select('id, cpf, dni')
        .maybeSingle<PatientRow>()

      if (insertError) {
        console.error('[patients-wallet-topup] Failed to auto-create patient row:', insertError)
      } else if (insertedPatient) {
        patient = insertedPatient
      }
    }

    if (!patient?.id) {
      console.error('[patients-wallet-topup] Patient profile not found for user:', user.id)
      return new Response(
        JSON.stringify({ error: 'Patient profile not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const patientId = patient.id

    const payerEmail = roleProfile.email || user.email
    if (!payerEmail) {
      return new Response(
        JSON.stringify({ error: 'patient_email_not_found' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // Currency must be backed by patient jurisdiction and/or existing wallet.
    // A default ARS wallet must not silently turn a Brazilian payment into ARS.
    const { data: existingWallet, error: walletLookupError } = await supabaseAdmin
      .from('patient_wallets')
      .select('currency')
      .eq('patient_id', patientId)
      .maybeSingle()
    if (walletLookupError) {
      return new Response(JSON.stringify({ error: 'wallet_currency_lookup_failed' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const billing = resolveBillingCurrency({
      patientCpf: patient.cpf,
      patientDni: patient.dni,
      walletCurrency: existingWallet?.currency,
    })
    if (!billing.ok) {
      return new Response(JSON.stringify({ error: billing.error }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const billingCurrency = billing.currency

    // New verified patient wallet: preserve denomination at creation. Never
    // overwrite an existing wallet's currency or convert an existing balance.
    if (!existingWallet) {
      const { error: createWalletError } = await supabaseAdmin
        .from('patient_wallets')
        .insert({ patient_id: patientId, currency: billingCurrency })
      if (createWalletError) {
        return new Response(JSON.stringify({ error: 'wallet_currency_creation_failed' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // 4. MercadoPago Preference
    const mpAccessToken = getMercadoPagoMarketToken(billingCurrency)
    if (!mpAccessToken) {
      console.error('[patients-wallet-topup] Market-specific MercadoPago credential is missing')
      return new Response(
        JSON.stringify({ error: 'MercadoPago token for selected market is not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const appUrl = (Deno.env.get('APP_URL') ?? 'https://www.autamedica.com').replace(/\/+$/, '')

    const mpPayload = {
      items: [
        {
          title: 'AutaMedica - Carga de Saldo',
          description: 'Carga de credito virtual en billetera para consultas medicas en AutaMedica',
          quantity: 1,
          unit_price: amount,
          currency_id: billingCurrency,
        },
      ],
      payer: { email: payerEmail },
      back_urls: {
        success: `${appUrl}/patients/appointments?payment=success&type=wallet_topup`,
        failure: `${appUrl}/patients/appointments?payment=failure&type=wallet_topup`,
        pending: `${appUrl}/patients/appointments?payment=pending&type=wallet_topup`,
      },
      auto_return: 'approved',
      statement_descriptor: 'AUTAMEDICA',
      notification_url: `${supabaseUrl}/functions/v1/mobile-payments-webhook?market=${billingCurrency === 'BRL' ? 'BR' : 'AR'}`,
      metadata: {
        type: 'wallet_topup',
        patient_id: patientId,
        amount_cents: amountCents,
        currency: billingCurrency,
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
      console.error('[patients-wallet-topup] MercadoPago API error:', mpResponse.status, errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to create MercadoPago preference', details: errorText }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const mpData = await mpResponse.json() as MercadoPagoPreferenceResponse

    return new Response(
      JSON.stringify({
        checkoutUrl: mpData.init_point,
        preferenceId: mpData.id,
        amountCents: amountCents,
        currency: billingCurrency,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (err) {
    console.error('[patients-wallet-topup] Unexpected error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
}

Deno.serve(handler)
