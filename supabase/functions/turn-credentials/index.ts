import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'

interface IceServerEntry {
  urls: string | string[]
  username?: string
  credential?: string
}

const STUN_FALLBACK: IceServerEntry[] = [
  { urls: ['stun:stun.l.google.com:19302'] },
  { urls: ['stun:stun1.l.google.com:19302'] },
  { urls: ['stun:stun2.l.google.com:19302'] },
  { urls: ['stun:stun3.l.google.com:19302'] },
  { urls: ['stun:stun4.l.google.com:19302'] },
]

const ALLOWED_ROLES = [
  'patient',
  'doctor',
  'admin',
  'platform_admin',
  'organization_admin',
]

export async function handler(req: Request): Promise<Response> {
  // Implementation

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
      console.error('[turn-credentials] Missing Supabase environment variables')
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
      console.error('[turn-credentials] JWT verification error:', authError)
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const user = authData.user

    // 2. Role verification: must be an authenticated patient or doctor
    const jwtRole = user.app_metadata?.role as string | undefined
    let isAuthorized = !!jwtRole && ALLOWED_ROLES.includes(jwtRole)

    if (!isAuthorized) {
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })

      // Check if user exists in patients table
      const { data: patient } = await supabaseAdmin
        .from('patients')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (patient) {
        isAuthorized = true
      } else {
        // Check if user exists in doctors table
        const { data: doctor } = await supabaseAdmin
          .from('doctors')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle()

        if (doctor) {
          isAuthorized = true
        } else {
          // Check profiles table
          const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('role')
            .eq('user_id', user.id)
            .maybeSingle()

          if (profile && ALLOWED_ROLES.includes(profile.role)) {
            isAuthorized = true
          }
        }
      }
    }

    if (!isAuthorized) {
      console.warn('[turn-credentials] User is neither a patient nor a doctor:', user.id)
      return new Response(
        JSON.stringify({ error: 'Forbidden: user is not an authorized patient or doctor' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // 3. Read Cloudflare Calls TURN environment variables
    const keyId = Deno.env.get('CLOUDFLARE_CALLS_TURN_KEY_ID')
    const turnToken = Deno.env.get('CLOUDFLARE_CALLS_TURN_TOKEN')

    // 4. Fallback to STUN if TURN credentials are not configured
    if (!keyId || !turnToken) {
      console.warn('[turn-credentials] TURN not configured — using STUN fallback')
      return new Response(
        JSON.stringify({ ok: true, iceServers: STUN_FALLBACK }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        }
      )
    }

    // 5. Generate TURN credentials via Cloudflare Calls API
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${turnToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl: 86400 }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[turn-credentials] Cloudflare API error:', response.status, errorText)
      return new Response(
        JSON.stringify({ ok: false, error: 'Failed to generate TURN credentials' }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    const data = await response.json() as { iceServers?: IceServerEntry[] }

    // Filter out port 53 URLs — browsers block them causing ICE timeout delays
    const filtered = (data.iceServers ?? [])
      .map((server) => {
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls]
        const clean = urls.filter((u) => !u.includes(':53'))
        return { ...server, urls: clean }
      })
      .filter((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]).length > 0)

    return new Response(
      JSON.stringify({ ok: true, iceServers: filtered }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'private, max-age=86100',
        },
      }
    )
  } catch (err) {
    console.error('[turn-credentials] Error generating TURN credentials:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return new Response(
      JSON.stringify({ ok: false, error: 'Internal server error', details: message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
};

Deno.serve(handler);
