import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'

interface PatientRow {
  id: string
}

interface WalletBalanceRow {
  patient_id?: string
  available_credit_cents?: number | string | null
  locked_credit_cents?: number | string | null
  total_credit_cents?: number | string | null
  currency?: string | null
}

export async function handler(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Support GET and POST
  if (req.method !== 'GET' && req.method !== 'POST') {
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
      console.error('[patients-wallet-balance] Missing Supabase environment variables')
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
      console.error('[patients-wallet-balance] JWT verification error:', authError)
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const user = authData.user

    // 2. Database operations using supabaseAdmin
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: patient, error: patientError } = await supabaseAdmin
      .from('patients')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle<PatientRow>()

    if (patientError) {
      console.error('[patients-wallet-balance] Patient lookup error:', patientError)
    }

    // If no patient record exists, return default zero balance
    if (!patient) {
      return new Response(
        JSON.stringify({
          available_credit_cents: 0,
          locked_credit_cents: 0,
          total_credit_cents: 0,
          currency: 'ARS',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // 3. Call RPC to get wallet balance
    const { data: balanceRows, error: balanceError } = await supabaseAdmin
      .rpc('patient_wallet_get_balance', { p_patient_id: patient.id })

    if (balanceError) {
      console.error('[patients-wallet-balance] RPC error:', balanceError)
      return new Response(
        JSON.stringify({ error: 'Failed to retrieve wallet balance', details: balanceError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const balance = Array.isArray(balanceRows)
      ? (balanceRows[0] as WalletBalanceRow | undefined)
      : (balanceRows as WalletBalanceRow | null)

    const availableCreditCents = balance?.available_credit_cents ?? 0
    const lockedCreditCents = balance?.locked_credit_cents ?? 0
    const totalCreditCents = balance?.total_credit_cents ?? 0
    const currency = balance?.currency || 'ARS'

    return new Response(
      JSON.stringify({
        available_credit_cents: Number(availableCreditCents),
        locked_credit_cents: Number(lockedCreditCents),
        total_credit_cents: Number(totalCreditCents),
        currency: currency || 'ARS',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (err) {
    console.error('[patients-wallet-balance] Unexpected error:', err)
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
