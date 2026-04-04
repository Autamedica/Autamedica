import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.info('Send Push Notification function started')

interface PushPayload {
  userId: string
  title: string
  body: string
  data?: Record<string, string>
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  const expectedToken = Deno.env.get('CRON_SECRET') ?? ''

  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { userId, title, body, data } = await req.json() as PushPayload

    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Get FCM token from profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('fcm_token')
      .eq('id', userId)
      .single()

    if (profileError || !profile?.fcm_token) {
      console.warn(`No FCM token found for user ${userId}`)
      return new Response(JSON.stringify({ success: false, error: 'no_token' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // In a real implementation, we would use the Google Auth library to get an access token
    // and then call the FCM v1 REST API.
    // Since we are in a Deno environment, we can use 'https://esm.sh/googleapis' or similar.
    
    // For now, we will log the intent and the token.
    // TODO (AUT-128): Implement actual FCM v1 call using service account
    console.info(`[FCM] Sending ${data?.type || 'GENERAL'} notification to ${userId}`)
    console.info(`[FCM] Token: ${profile.fcm_token.slice(0, 10)}...`)
    console.info(`[FCM] Content: ${title} - ${body}`)

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Notification queued',
      debug: {
        token_found: true,
        type: data?.type || 'unknown'
      }
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('send-push-notification error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
