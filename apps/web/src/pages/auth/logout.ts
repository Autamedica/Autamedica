import type { APIRoute } from 'astro';
import { createServerClient, type CookieMethodsServer } from '@supabase/ssr';
import { resolvePublicSupabaseEnv } from '../../lib/runtime-env';
import { isProduction } from '../../lib/auth-utils';

export const GET: APIRoute = async ({ request, cookies, redirect, locals }) => {
  const { publicSupabaseUrl, publicSupabaseAnonKey } = resolvePublicSupabaseEnv(locals.runtime?.env);

  if (!publicSupabaseUrl || !publicSupabaseAnonKey) {
    return redirect('/auth/login');
  }

  const supabase = createServerClient(publicSupabaseUrl, publicSupabaseAnonKey, {
    cookies: {
      getAll() {
        const cookieHeader = request.headers.get('cookie') ?? '';
        if (!cookieHeader) return [];
        return cookieHeader.split('; ').map((c) => {
          const eq = c.indexOf('=');
          return {
            name: eq >= 0 ? c.slice(0, eq) : c,
            value: eq >= 0 ? c.slice(eq + 1) : '',
          };
        });
      },
      setAll(cookiesToSet: Parameters<NonNullable<CookieMethodsServer['setAll']>>[0]) {
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
    },
  });

  await supabase.auth.signOut();

  return redirect('/auth/login');
};
