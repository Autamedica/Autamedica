import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'
import { isAuthorizedPushRequest } from './authorization.ts'

console.info('Send Push Notification function started')

interface ServiceAccount {
  type: string
  project_id: string
  private_key_id: string
  private_key: string
  client_email: string
  client_id: string
  token_uri: string
  auth_uri: string
}

interface PushPayload {
  userId: string
  title: string
  body: string
  data?: Record<string, string>
}

function base64UrlEncode(input: string): string {
  return btoa(input)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64UrlDecodeToBinary(input: string): Uint8Array {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=')
  const raw = atob(padded)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i)
  }
  return bytes
}

function pemToBinary(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s+/g, '')
  const bytes = base64UrlDecodeToBinary(body)
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

async function signJwt(
  clientEmail: string,
  privateKey: string,
  tokenUri: string,
  scope: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: clientEmail,
    scope,
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claims))}`

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBinary(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  )

  const sigBytes = new Uint8Array(signature)
  let sigBase64 = ''
  for (let i = 0; i < sigBytes.length; i++) {
    sigBase64 += String.fromCharCode(sigBytes[i])
  }

  return `${signingInput}.${base64UrlEncode(sigBase64)}`
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const jwt = await signJwt(
    sa.client_email,
    sa.private_key,
    sa.token_uri,
    'https://www.googleapis.com/auth/firebase.messaging',
  )

  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const body = await res.json().catch(() => null) as { access_token?: string; error?: string } | null

  if (!res.ok || !body?.access_token) {
    throw new Error(`OAuth2 token exchange failed: ${res.status} ${JSON.stringify(body)}`)
  }

  return body.access_token
}

async function sendFcm(sa: ServiceAccount, message: Record<string, unknown>): Promise<{ ok: boolean; status: number; body: unknown }> {
  const accessToken = await getAccessToken(sa)

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    },
  )

  const body = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, body }
}

function parseServiceAccount(raw: string | null): ServiceAccount | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as ServiceAccount
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Authorize before parsing the request body. A claimed dispatch event is NOT
  // proof of origin: only service_role / CRON_SECRET / PUSH_DISPATCH_SECRET qualify.
  if (!isAuthorizedPushRequest(req.headers.get('Authorization'), {
    cronSecret: Deno.env.get('CRON_SECRET'),
    serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    dispatchSecret: Deno.env.get('PUSH_DISPATCH_SECRET'),
    anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
  })) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let bodyPayload: PushPayload | null
  try {
    bodyPayload = await req.json() as PushPayload
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    )

    const { userId, title, body, data } = bodyPayload ?? {}

    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('fcm_token')
      .eq('user_id', userId)
      .single()

    if (profileError || !profile?.fcm_token) {
      console.warn(`No FCM token found for user ${userId}`)
      return new Response(JSON.stringify({ success: false, error: 'no_token' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const sa = parseServiceAccount(Deno.env.get('FIREBASE_SERVICE_ACCOUNT') ?? null)
    if (!sa) {
      console.error('FIREBASE_SERVICE_ACCOUNT secret is missing or invalid')
      return new Response(JSON.stringify({ error: 'firebase_not_configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const isCallNotification = (
      data?.type === 'CALL_STARTED' ||
      data?.type === 'PATIENT_CONNECTED' ||
      data?.type === 'INCOMING_CALL'
    )

    const isDispatchNotification = (
      data?.type === 'pharmacy_dispatch_incoming' ||
      data?.notification_type === 'pharmacy_dispatch_incoming'
    )

    const message: Record<string, unknown> = {
      token: profile.fcm_token,
      data: {
        type: data?.type ?? 'GENERAL',
        title: title ?? 'AutaMedica',
        body: body ?? '',
        ...data,
      },
      android: {
        priority: (isCallNotification || isDispatchNotification) ? 'high' : 'normal',
      },
    }

    // Las notificaciones de llamada (CALL_STARTED / INCOMING_CALL / PATIENT_CONNECTED)
    // y los dispatch on-demand son data-only con prioridad máxima: la app recibe el
    // mensaje en onMessageReceived aunque esté en background (proceso FCM vivo) y
    // construye la notificación full-screen en su canal dedicado. Al no incluir el
    // bloque `notification`, FCM no lo renderiza como BigTextStyle del sistema y el
    // countdown regresivo del dispatch (30 s) puede correr desde la app.
    if (!isCallNotification && !isDispatchNotification) {
      message.notification = { title: title ?? 'AutaMedica', body: body ?? '' }
    }

    // flash: countdown regresivo del dispatch (30 s) puede correr desde la app.
    // Los dispatch DEBEN quedar en data-only puro: si se incluye el bloque
    // android.notification, FCM renderiza además una notificación del sistema
    // (tag FCM-Notification) duplicada sobre la custom con countdown. El canal
    // autamedica_dispatch_incoming lo crea la app en createDispatchChannel().
    // El bloque `android` ya fue seteado arriba con priority high para
    // call/dispatch y normal para el resto.

    const result = await sendFcm(sa, message)

    if (!result.ok) {
      console.error('[FCM] send failed', { status: result.status, body: result.body })
      return new Response(
        JSON.stringify({ success: false, error: 'fcm_send_failed', details: result.body }),
        { status: result.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    console.info('[FCM] Sent notification', { type: data?.type ?? 'GENERAL', status: result.status })
    return new Response(JSON.stringify({ success: true, type: data?.type ?? 'GENERAL', fcm: result.body }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('send-push-notification error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})