/**
 * Session sync endpoint — devuelve la sesión activa del usuario.
 *
 * Usado por los portales (doctors, companies, etc.) para verificar
 * que hay una sesión válida sin redirigir al login.
 *
 * CORS: solo permite autamedica.com y *.autamedica.com
 */

import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { isProduction } from '../../lib/auth-utils';
import { resolvePublicSupabaseEnv } from '../../lib/runtime-env';
import { createSupabaseCookieClient, type CookieMethodsServer } from '../../lib/supabase';

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin?.match(/^http:\/\/localhost:\d+$/) ||
    origin?.match(/^https:\/\/([\w-]+\.)?autamedica\.com$/)
      ? origin
      : 'https://autamedica.com';

  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

export const OPTIONS: APIRoute = async ({ request }) => {
  const origin = request.headers.get('origin');
  return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
};

export const GET: APIRoute = async ({ request, cookies, locals }) => {
  const origin = request.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { publicSupabaseUrl, publicSupabaseAnonKey } = resolvePublicSupabaseEnv(
      locals.runtime?.env,
    );

    if (!publicSupabaseUrl || !publicSupabaseAnonKey) {
      throw new Error(
        `[session-sync] Missing env: PUBLIC_SUPABASE_URL=${!!publicSupabaseUrl}, ` +
          `PUBLIC_SUPABASE_ANON_KEY=${!!publicSupabaseAnonKey}.`,
      );
    }

    const cookieMethods: CookieMethodsServer = {
      getAll() {
        const cookieHeader = request.headers.get('cookie') ?? '';
        if (!cookieHeader) return [];
        return cookieHeader.split('; ').map(c => {
          const eq = c.indexOf('=');
          return {
            name: eq >= 0 ? c.slice(0, eq) : c,
            value: eq >= 0 ? c.slice(eq + 1) : '',
          };
        });
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookies.set(name, value, {
            ...options,
            domain: isProduction() ? '.autamedica.com' : undefined,
            path: '/',
            sameSite: 'lax',
            secure: isProduction(),
          } as Parameters<typeof cookies.set>[2]);
        }
      },
    };

    const supabase = createSupabaseCookieClient(publicSupabaseUrl, publicSupabaseAnonKey, cookieMethods);

    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return new Response(
        JSON.stringify({ error: error?.message ?? 'No active session' }),
        { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          role: user.app_metadata?.role,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (err) {
    logger.error('Session sync error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
};
