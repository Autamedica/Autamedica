import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

// Strict CORS + auth helper used by ingestion paths that require origin whitelisting.
// Current usage: ingest-patient-observation edge function.
//
// Other edge functions still use _shared/cors.ts (Access-Control-Allow-Origin: *) for
// backwards compatibility and should be migrated only with coordinated frontend rollout.

const ALLOWED_ORIGINS = new Set([
  'https://autamedica.com',
  'https://www.autamedica.com',
  'https://patients.autamedica.com',
  'https://paciente.autamedica.com',
  'https://doctor.autamedica.com',
  'https://empresa.autamedica.com',
  'https://autamedica-web.pages.dev',
  'https://autamedica-patients.pages.dev',
  'https://autamedica-doctors.pages.dev',
  'https://autamedica-companies.pages.dev',
  'https://autamedica-admin.pages.dev',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3004',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:4001',
  'http://localhost:4002',
]);

export interface AuthContext {
  user: User;
  userClient: SupabaseClient;
  serviceClient: SupabaseClient;
}

export function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://autamedica.com';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage',
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

export function jsonResponse(
  payload: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export async function requireAuth(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<AuthContext> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    throw jsonResponse(
      {
        error: 'Missing Supabase environment variables',
        code: 'CONFIG_ERROR',
      },
      500,
      corsHeaders,
    );
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw jsonResponse(
      {
        error: 'Missing Authorization header',
        code: 'AUTH_REQUIRED',
      },
      401,
      corsHeaders,
    );
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) {
    throw jsonResponse(
      {
        error: 'Invalid or expired token',
        code: 'AUTH_INVALID',
      },
      401,
      corsHeaders,
    );
  }

  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return {
    user: data.user,
    userClient,
    serviceClient,
  };
}
