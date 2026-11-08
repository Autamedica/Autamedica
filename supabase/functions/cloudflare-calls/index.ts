import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * cloudflare-calls
 *
 * Proxy autenticado hacia la API de Cloudflare Calls (SFU) para el plano de
 * medios canónico (ADR-0003). A diferencia de los proxy del web, esta función
 * valida que el usuario autenticado sea participante real de la sala (doctor o
 * paciente de la llamada) antes de reenviar cualquier operación al SFU.
 *
 * Envelope del cliente (port Kotlin CloudflareCallsSession):
 *   { roomId, method, path, body }
 *
 * - roomId  -> room_id de una fila en `calls`.
 * - method  -> POST | PUT (sessions/new, tracks/new, renegotiate, tracks/close).
 * - path    -> ruta Cloudflare Calls relativa a v1/apps/{appId}.
 * - body    -> payload a reenviar (offer SDP, tracks, sessionDescription...).
 *
 * Los secretos del SFU (CLOUDFLARE_CALLS_APP_ID / CLOUDFLARE_CALLS_APP_SECRET)
 * viven solo en runtime; nunca llegan al cliente.
 */

interface CloudflareCallsPayload {
  roomId?: unknown
  method?: unknown
  path?: unknown
  body?: unknown
}

const TERMINAL_CALL_STATUSES = new Set(['declined', 'canceled', 'ended'])

const ALLOWED_PATHS = new RegExp(
  '^sessions/new$'
    + '|^sessions/[A-Za-z0-9._-]+/tracks/new$'
    + '|^sessions/[A-Za-z0-9._-]+/renegotiate$'
    + '|^sessions/[A-Za-z0-9._-]+/tracks/close$'
)

export function isAllowedPath(path: unknown): boolean {
  return typeof path === 'string' && ALLOWED_PATHS.test(path)
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: 'Missing authorization header' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '' // secrets.SUPABASE_SERVICE_ROLE_KEY
  const appId = Deno.env.get('CLOUDFLARE_CALLS_APP_ID')
  const appSecret = Deno.env.get('CLOUDFLARE_CALLS_APP_SECRET')

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    console.error('[cloudflare-calls] Missing Supabase environment variables')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (!appId || !appSecret) {
    console.warn('[cloudflare-calls] CLOUDFLARE_CALLS_APP_ID o CLOUDFLARE_CALLS_APP_SECRET no configurados')
    return new Response(
      JSON.stringify({ error: 'Cloudflare Calls not configured' }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  let payload: CloudflareCallsPayload
  try {
    payload = await req.json() as CloudflareCallsPayload
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const roomId = typeof payload.roomId === 'string' ? payload.roomId.trim() : ''
  const method = typeof payload.method === 'string' ? payload.method.toUpperCase() : 'POST'
  const path = payload.path

  if (!roomId) {
    return new Response(
      JSON.stringify({ error: 'Missing required field: roomId' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (!isAllowedPath(path)) {
    return new Response(
      JSON.stringify({ error: 'Invalid or forbidden Cloudflare Calls path' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (method !== 'POST' && method !== 'PUT') {
    return new Response(
      JSON.stringify({ error: 'Cloudflare Calls method must be POST or PUT' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // 1. Verificar JWT del usuario
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    })

    const token = authHeader.replace(/^Bearer\s+/i, '')
    const { data: authData, error: authError } = await supabaseUser.auth.getUser(token)
    if (authError || !authData.user) {
      console.error('[cloudflare-calls] JWT verification error:', authError)
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const userId = authData.user.id

    // 2. Resolver la llamada por room_id
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Jordan is a BR-only commercial referral. A signed user JWT or
    // assigned doctor is not proof of a paid consultation. This check runs
    // BEFORE the ordinary 'calls' lookup so both normal and dispatch-backed
    // room paths are covered, including doctor entry.
    const { data: mediaDispatch, error: mediaDispatchError } = await supabaseAdmin
      .from('pharmacy_dispatch_requests')
      .select('id,care_country,referral_partner_id')
      .eq('cloudflare_room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (mediaDispatchError) {
      return new Response(JSON.stringify({ error: 'Media authorization unavailable' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (mediaDispatch?.referral_partner_id) {
      const { data: partner, error: partnerError } = await supabaseAdmin
        .from('commercial_referral_partners')
        .select('code,active')
        .eq('id', mediaDispatch.referral_partner_id)
        .maybeSingle()

      // Never treat failed partner resolution as an ordinary, free consultation.
      if (partnerError || !partner) {
        return new Response(JSON.stringify({ error: 'Media authorization unavailable' }), {
          status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (partner.code === 'JORDAN') {
        if (mediaDispatch.care_country !== 'BR' || partner.active !== true) {
          return new Response(JSON.stringify({ error: 'Jordan is limited to Brazil' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const { data: payment, error: paymentError } = await supabaseAdmin
          .from('pharmacy_dispatch_payments')
          .select('status,provider,provider_payment_id,paid_at,amount_minor,currency')
          .eq('dispatch_request_id', mediaDispatch.id)
          .maybeSingle()

        if (paymentError) {
          return new Response(JSON.stringify({ error: 'Media authorization unavailable' }), {
            status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        const approved = payment?.status === 'approved'
          && payment.provider === 'mercadopago'
          && typeof payment.provider_payment_id === 'string'
          && /^\\d{1,20}$/.test(payment.provider_payment_id)
          && Boolean(payment.paid_at)
          && payment.amount_minor === 7900
          && payment.currency === 'BRL'
        if (!approved) {
          return new Response(JSON.stringify({ error: 'jordan_payment_required' }), {
            status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomId)
    let callQuery = supabaseAdmin
      .from('calls')
      .select('id, room_id, doctor_id, patient_id, appointment_id, status')

    if (isUuid) {
      callQuery = callQuery
        .or(`room_id.eq.${roomId},id.eq.${roomId},appointment_id.eq.${roomId}`)
        .order('created_at', { ascending: false })
    } else {
      callQuery = callQuery
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
    }

    const { data: callRow, error: callError } = await callQuery
      .limit(1)
      .maybeSingle()

    if (callError) {
      console.error('[cloudflare-calls] Error resolving call by room:', callError)
      return new Response(
        JSON.stringify({ error: 'Failed to resolve room' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let call = callRow

    // Fallback: On-Demand Pharmacy Dispatch Room (kiosks / street emergency triage)
    if (!call) {
      const { data: dispatch, error: dispatchErr } = await supabaseAdmin
        .from('pharmacy_dispatch_requests')
        .select('id, cloudflare_room_id, assigned_doctor_id, status, patient_dni, patient_cpf, patient_id, requested_by_user_id')
        .eq('cloudflare_room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!dispatchErr && dispatch) {
        if (dispatch.status === 'completed' || dispatch.status === 'cancelled' || dispatch.status === 'expired') {
          console.warn('[cloudflare-calls] Dispatch call is terminal:', { dispatchId: dispatch.id, status: dispatch.status })
          return new Response(
            JSON.stringify({ error: 'Call is not active', status: dispatch.status }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        call = {
          id: dispatch.id,
          room_id: dispatch.cloudflare_room_id,
          doctor_id: dispatch.assigned_doctor_id,
          patient_id: dispatch.patient_id ?? dispatch.requested_by_user_id,
          appointment_id: null,
          status: dispatch.status,
        }
      }
    }

    if (!call) {
      console.warn('[cloudflare-calls] Room not found for call:', { roomId, userId })
      return new Response(
        JSON.stringify({ error: 'Forbidden: not a participant of this call' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (TERMINAL_CALL_STATUSES.has(call.status)) {
      console.warn('[cloudflare-calls] Call is terminal, media plane closed:', {
        callId: call.id,
        status: call.status,
      })
      return new Response(
        JSON.stringify({ error: 'Call is not active', status: call.status }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Validar que el usuario autenticado es doctor o paciente de la llamada
    let isDoctor = call.doctor_id === userId
    let isPatient = call.patient_id === userId

    if (!isDoctor && call.doctor_id) {
      const { data: doctor } = await supabaseAdmin
        .from('doctors')
        .select('user_id')
        .eq('id', call.doctor_id)
        .limit(1)
        .maybeSingle()
      isDoctor = doctor?.user_id === userId
    }

    if (!isPatient && call.patient_id) {
      const { data: patient } = await supabaseAdmin
        .from('patients')
        .select('user_id')
        .eq('id', call.patient_id)
        .limit(1)
        .maybeSingle()
      isPatient = patient?.user_id === userId
    }

    // Fallback: Si no se encontró en la fila calls pero hay appointment_id, resolver desde appointments
    if (!isDoctor && !isPatient && call.appointment_id) {
      const { data: appt } = await supabaseAdmin
        .from('appointments')
        .select('patient_id, doctor_id')
        .eq('id', call.appointment_id)
        .limit(1)
        .maybeSingle()

      if (appt?.doctor_id && !isDoctor) {
        if (appt.doctor_id === userId) {
          isDoctor = true
        } else {
          const { data: doc } = await supabaseAdmin
            .from('doctors')
            .select('user_id')
            .eq('id', appt.doctor_id)
            .limit(1)
            .maybeSingle()
          isDoctor = doc?.user_id === userId
        }
      }

      if (appt?.patient_id && !isPatient && !isDoctor) {
        if (appt.patient_id === userId) {
          isPatient = true
        } else {
          const { data: pat } = await supabaseAdmin
            .from('patients')
            .select('user_id')
            .eq('id', appt.patient_id)
            .limit(1)
            .maybeSingle()
          isPatient = pat?.user_id === userId
        }
      }
    }

    // Guardia on-demand: el paciente solo se autoriza vía requested_by_user_id (call.patient_id)
    // resuelto en el fallback de la sala. Sin fallback "cualquier no-médico es paciente".
    if (!isDoctor && !isPatient) {
      console.warn('[cloudflare-calls] User is not a participant of the call:', {
        userId,
        callId: call.id,
        doctorId: call.doctor_id,
        patientId: call.patient_id,
      })
      return new Response(
        JSON.stringify({ error: 'Forbidden: not a participant of this call' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.info('[cloudflare-calls] Authorized media plane access:', {
      userId,
      role: isDoctor ? 'doctor' : 'patient',
      callId: call.id,
      roomId,
      path,
    })

    // 4. Proxy hacia Cloudflare Calls SFU
    const url = `https://rtc.live.cloudflare.com/v1/apps/${appId}/${path}`
    const body = payload.body !== undefined ? JSON.stringify(payload.body) : undefined

    const cfRes = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${appSecret}`,
        'Content-Type': 'application/json',
        'User-Agent': 'AutaMedica-Telemedicine-SFU/1.0',
      },
      body,
    })

    const cfBody = await cfRes.json().catch(() => null) ?? (await cfRes.text().catch(() => ''))
    return new Response(
      JSON.stringify(cfBody),
      { status: cfRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[cloudflare-calls] Error proxying Cloudflare Calls request:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

Deno.serve(handler)