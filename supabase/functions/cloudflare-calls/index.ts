import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'
import { authorizeEdgeSfuBinding, recordEdgeSfuSession } from '../_shared/sfu-room-session-binding.ts'
import { guestDispatchCallMatches } from '../_shared/guest-dispatch-access.ts'

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

interface GuestTokenPayload {
  callId: string
  roomId: string
  guestName: string
  role: 'guest'
  iat: number
  exp: number
}

const GUEST_TOKEN_TTL_SECONDS = 7200

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return null
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
  } catch {
    return null
  }
}

/** Verifies the exact HS256 JWT emitted by the web guest-token module. */
export async function verifyGuestToken(token: string, secret: string): Promise<GuestTokenPayload | null> {
  if (!secret || !token || token.length > 4096) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerPart, payloadPart, signaturePart] = parts
  const headerBytes = decodeBase64Url(headerPart)
  const payloadBytes = decodeBase64Url(payloadPart)
  const signature = decodeBase64Url(signaturePart)
  if (!headerBytes || !payloadBytes || !signature || signature.length !== 32) return null

  try {
    const header = JSON.parse(new TextDecoder().decode(headerBytes)) as Record<string, unknown>
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
    )
    const signingInput = new TextEncoder().encode(`${headerPart}.${payloadPart}`)
    // Deno's WebCrypto BufferSource typing requires ArrayBuffer-backed views.
    const signatureBuffer = new ArrayBuffer(signature.byteLength)
    new Uint8Array(signatureBuffer).set(signature)
    const signingInputBuffer = new ArrayBuffer(signingInput.byteLength)
    new Uint8Array(signingInputBuffer).set(signingInput)
    if (!await crypto.subtle.verify('HMAC', key, signatureBuffer, signingInputBuffer)) return null
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as GuestTokenPayload
    if (payload.role !== 'guest' || typeof payload.callId !== 'string' || !payload.callId ||
        typeof payload.roomId !== 'string' || !payload.roomId ||
        typeof payload.guestName !== 'string' || !payload.guestName ||
        typeof payload.iat !== 'number' || !Number.isFinite(payload.iat) ||
        typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return null
    const now = Math.floor(Date.now() / 1000)
    if (now >= payload.exp || payload.iat > now + 60 ||
        payload.exp <= payload.iat || payload.exp - payload.iat > GUEST_TOKEN_TTL_SECONDS) return null
    return payload
  } catch {
    return null
  }
}

const TERMINAL_CALL_STATUSES = new Set(['declined', 'canceled', 'cancelled', 'ended', 'completed', 'expired'])

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
  const guestTokenHeader = req.headers.get('x-guest-token')
  if (!authHeader && !guestTokenHeader) {
    return new Response(
      JSON.stringify({ error: 'Missing authorization or guest token' }),
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
  const path = typeof payload.path === 'string' ? payload.path : ''

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
    // Supabase Functions may attach the public anon key as its default bearer.
    // That key is not a user identity; only a verified access token is.
    const authorization = authHeader?.trim() ?? ''
    let bearerToken: string | null = null
    if (authorization) {
      const bearer = /^Bearer\s+([A-Za-z0-9._-]+)$/i.exec(authorization)
      if (!bearer) {
        return new Response(JSON.stringify({ error: 'Invalid authorization header' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (bearer[1] !== supabaseAnonKey) bearerToken = bearer[1]
    }

    let userId: string | null = null
    let guestClaims: GuestTokenPayload | null = null
    if (bearerToken) {
      // A forged/expired user JWT must not fall back to guest authorization.
      const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: authorization } },
      })
      const { data: authData, error: authError } = await supabaseUser.auth.getUser(bearerToken)
      if (authError || !authData.user) {
        console.error('[cloudflare-calls] JWT verification failed')
        return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      userId = authData.user.id
    } else if (guestTokenHeader) {
      guestClaims = await verifyGuestToken(guestTokenHeader, Deno.env.get('GUEST_TOKEN_SECRET') ?? '')
      if (!guestClaims) {
        return new Response(JSON.stringify({ error: 'invalid_guest_token' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (guestClaims.roomId !== roomId) {
        return new Response(JSON.stringify({ error: 'guest_room_mismatch' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else {
      return new Response(JSON.stringify({ error: 'Missing authenticated user or guest token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const principalKey = guestClaims ? `guest:${guestClaims.callId}` : `user:${userId as string}`

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
      .select('id,call_id,cloudflare_room_id,assigned_doctor_id,status,patient_id,requested_by_user_id,care_country,referral_partner_id')
      .eq('cloudflare_room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (mediaDispatchError) {
      return new Response(JSON.stringify({ error: 'Media authorization unavailable' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check the signed request scope before inspecting payment state. A token
    // for another dispatch is always a 403, regardless of that dispatch's PSP.
    if (guestClaims && mediaDispatch &&
        ((mediaDispatch.id !== guestClaims.callId && mediaDispatch.call_id !== guestClaims.callId) ||
         mediaDispatch.cloudflare_room_id !== guestClaims.roomId)) {
      return new Response(JSON.stringify({ error: 'guest_call_mismatch' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let isJordanRoom = false
    let isPaidBrazilDispatch = false
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
      if (partner.active !== true) {
        return new Response(JSON.stringify({ error: 'Referral partner is inactive' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (partner.code === 'JORDAN') {
        isJordanRoom = true
        if (mediaDispatch.care_country !== 'BR') {
          return new Response(JSON.stringify({ error: 'Jordan is limited to Brazil' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }
    }

    // Every Brazil pharmacy express consultation is payment-first, regardless
    // of whether it came from the Jordan QR or the direct pharmacy entry point.
    if (mediaDispatch?.care_country === 'BR') {
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
        && /^\d{1,20}$/.test(payment.provider_payment_id)
        && Boolean(payment.paid_at)
        && payment.amount_minor === 7900
        && payment.currency === 'BRL'
      if (!approved) {
        return new Response(JSON.stringify({ error: 'brazil_pharmacy_payment_required' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      isPaidBrazilDispatch = true
    }

    // Guest JWTs are issued for a dispatch request, not for a calls-table row.
    // Resolve only the exact signed dispatch id and room.
    let call: {
      id: string
      room_id: string
      doctor_id: string | null
      patient_id: string | null
      appointment_id: string | null
      status: string
    } | null = null

    if (guestClaims) {
      if (mediaDispatch) {
        // Pharmacy guest tokens identify a dispatch request. The actual SFU
        // call has a distinct calls.id linked via pharmacy_dispatch_requests.call_id.
        if ((mediaDispatch.id !== guestClaims.callId && mediaDispatch.call_id !== guestClaims.callId) ||
            mediaDispatch.cloudflare_room_id !== guestClaims.roomId) {
          return new Response(JSON.stringify({ error: 'guest_call_mismatch' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        if (mediaDispatch.care_country === 'BR' && !isPaidBrazilDispatch) {
          return new Response(JSON.stringify({ error: 'brazil_pharmacy_payment_required' }), {
            status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        if (!['matched', 'in_call'].includes(mediaDispatch.status) ||
            !mediaDispatch.assigned_doctor_id ||
            !mediaDispatch.call_id) {
          return new Response(JSON.stringify({ error: 'dispatch_not_ready' }), {
            status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        const { data: dispatchCall, error: dispatchCallError } = await supabaseAdmin
          .from('calls')
          .select('id, room_id, doctor_id, patient_id, appointment_id, status')
          .eq('id', mediaDispatch.call_id)
          .eq('room_id', mediaDispatch.cloudflare_room_id)
          .maybeSingle()

        if (dispatchCallError) {
          return new Response(JSON.stringify({ error: 'Media authorization unavailable' }), {
            status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        if (!guestDispatchCallMatches(mediaDispatch, guestClaims, dispatchCall)) {
          return new Response(JSON.stringify({ error: 'guest_call_mismatch' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        call = dispatchCall
      } else {
        // Existing non-pharmacy guest calls retain the exact callId+roomId contract.
        const { data: legacyCall, error: legacyCallError } = await supabaseAdmin
          .from('calls')
          .select('id, room_id, doctor_id, patient_id, appointment_id, status')
          .eq('id', guestClaims.callId)
          .eq('room_id', guestClaims.roomId)
          .maybeSingle()
        if (legacyCallError) {
          return new Response(JSON.stringify({ error: 'Media authorization unavailable' }), {
            status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        if (!legacyCall) {
          return new Response(JSON.stringify({ error: 'guest_call_mismatch' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        call = legacyCall
      }
    } else {
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

      const { data: callRow, error: callError } = await callQuery.limit(1).maybeSingle()
      if (callError) {
        console.error('[cloudflare-calls] Error resolving room:', callError)
        return new Response(JSON.stringify({ error: 'Failed to resolve room' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      call = callRow

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
            return new Response(JSON.stringify({ error: 'Call is not active', status: dispatch.status }), {
              status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }
          call = {
            id: dispatch.id, room_id: dispatch.cloudflare_room_id,
            doctor_id: dispatch.assigned_doctor_id,
            patient_id: dispatch.patient_id ?? dispatch.requested_by_user_id,
            appointment_id: null, status: dispatch.status,
          }
        }
      }
    }

    if (!call) {
      console.warn('[cloudflare-calls] Room not found for call:', { roomId, principalKey })
      return new Response(JSON.stringify({ error: 'Forbidden: not a participant of this call' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
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

    // 3. Authorize the participant. A guest is authorized only by the exact
    // signed callId+roomId above; JWT users retain doctor/patient membership checks.
    let participantRole: 'doctor' | 'patient' | 'guest' = guestClaims ? 'guest' : 'patient'
    if (guestClaims) {
      const matchesLegacyCall =
        call.id === guestClaims.callId &&
        call.room_id === guestClaims.roomId
      const matchesDispatchCall =
        mediaDispatch !== null &&
        (mediaDispatch.id === guestClaims.callId || mediaDispatch.call_id === guestClaims.callId) &&
        mediaDispatch.call_id === call.id &&
        mediaDispatch.cloudflare_room_id === call.room_id &&
        call.room_id === guestClaims.roomId
      if (!matchesLegacyCall && !matchesDispatchCall) {
        return new Response(JSON.stringify({ error: 'guest_call_or_room_mismatch' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else {
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      let isDoctor = call.doctor_id === userId
      let isPatient = call.patient_id === userId

      if (!isDoctor && call.doctor_id) {
        const { data: doctor } = await supabaseAdmin.from('doctors')
          .select('user_id').eq('id', call.doctor_id).limit(1).maybeSingle()
        isDoctor = doctor?.user_id === userId
      }
      if (!isPatient && call.patient_id) {
        const { data: patient } = await supabaseAdmin.from('patients')
          .select('user_id').eq('id', call.patient_id).limit(1).maybeSingle()
        isPatient = patient?.user_id === userId
      }

      if (!isDoctor && !isPatient && call.appointment_id) {
        const { data: appt } = await supabaseAdmin.from('appointments')
          .select('patient_id, doctor_id').eq('id', call.appointment_id).limit(1).maybeSingle()
        if (appt?.doctor_id && !isDoctor) {
          if (appt.doctor_id === userId) isDoctor = true
          else {
            const { data: doc } = await supabaseAdmin.from('doctors')
              .select('user_id').eq('id', appt.doctor_id).limit(1).maybeSingle()
            isDoctor = doc?.user_id === userId
          }
        }
        if (appt?.patient_id && !isPatient && !isDoctor) {
          if (appt.patient_id === userId) isPatient = true
          else {
            const { data: pat } = await supabaseAdmin.from('patients')
              .select('user_id').eq('id', appt.patient_id).limit(1).maybeSingle()
            isPatient = pat?.user_id === userId
          }
        }
      }

      if (!isDoctor && !isPatient) {
        console.warn('[cloudflare-calls] User is not a call participant:', {
          userId, callId: call.id, doctorId: call.doctor_id, patientId: call.patient_id,
        })
        return new Response(JSON.stringify({ error: 'Forbidden: not a participant of this call' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      participantRole = isDoctor ? 'doctor' : 'patient'
    }

    console.info('[cloudflare-calls] Authorized media plane access:', {
      principalKey, role: participantRole, callId: call.id, roomId, path,
    })

    // 4. Bind EVERY SFU session to the authorized participant/room before
    // any tracks operation. Existing ordinary calls retain their legacy path
    // until the separately approved binding flag is enabled on the Edge.
    const bindingsEnabled = Deno.env.get('SFU_SESSION_BINDINGS_ENABLED') === 'true'
    if (isJordanRoom && !bindingsEnabled) {
      return new Response(JSON.stringify({ error: 'jordan_sfu_session_binding_not_ready' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const requiredMethod = path === 'sessions/new' || path.endsWith('/tracks/new')
      ? 'POST' : 'PUT'
    if (method !== requiredMethod) {
      return new Response(JSON.stringify({ error: 'invalid_sfu_method' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (bindingsEnabled) {
      try {
        const bound = await authorizeEdgeSfuBinding(supabaseAdmin,roomId,principalKey,path,payload.body)
        if (!bound) {
          return new Response(JSON.stringify({ error: 'sfu_session_owner_or_room_mismatch' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      } catch {
        return new Response(JSON.stringify({ error: 'sfu_binding_lookup_unavailable' }), {
          status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

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

    // Never return a usable new SFU session ID before its scoped DB binding
    // is persisted. An orphaned Cloudflare session is not an authorization.
    if (bindingsEnabled && path === 'sessions/new' &&
        cfRes.status >= 200 && cfRes.status < 300) {
      try {
        const stored = await recordEdgeSfuSession(supabaseAdmin,roomId,principalKey,cfBody)
        if (!stored) throw new Error('sfu_session_id_missing')
      } catch {
        return new Response(JSON.stringify({ error: 'sfu_session_binding_unavailable' }), {
          status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

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