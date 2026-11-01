import { createClient } from 'npm:@supabase/supabase-js@2.78.0'
import { corsHeaders } from '../_shared/cors.ts'
import { handleUpdateCallStatus } from './handler.ts'

Deno.serve((req: Request) => handleUpdateCallStatus(req, {
  corsHeaders,
  createUserClient: (authorization) => createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  ),
}))
