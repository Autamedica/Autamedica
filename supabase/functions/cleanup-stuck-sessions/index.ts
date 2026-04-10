import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log('Starting cleanup of stuck conversation sessions...')

    // Define the threshold (e.g., 1 hour)
    const THRESHOLD_MINUTES = 60
    const thresholdDate = new Date(Date.now() - THRESHOLD_MINUTES * 60 * 1000).toISOString()

    /**
     * Case 1: Active sessions where started_at is very old AND no events exist.
     * Case 2: Active sessions where the last event is older than the threshold.
     */
    
    // We'll use a single RPC or a complex query. 
    // To keep it simple and safe for Edge Functions, we'll do an update with a subquery.
    
    const { data, error } = await supabaseClient.rpc('public.cleanup_stuck_conversation_sessions', {
      threshold_interval: `${THRESHOLD_MINUTES} minutes`
    })

    if (error) throw error

    console.log(`Cleanup complete. Result: ${JSON.stringify(data)}`)

    return new Response(
      JSON.stringify({ success: true, result: data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in cleanup-stuck-sessions:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
