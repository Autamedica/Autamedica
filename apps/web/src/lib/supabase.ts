/**
 * Helper de Supabase para Astro SSR.
 * Crea clientes para uso en páginas (.astro) y endpoints del servidor.
 */

import { createServerClient, type CookieMethodsServer } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

function parseCookieHeader(request: Request): Array<{ name: string; value: string }> {
  const cookieHeader = request.headers.get('cookie') ?? '';
  if (!cookieHeader) return [];
  return cookieHeader.split('; ').map(c => {
    const eq = c.indexOf('=');
    return {
      name: eq >= 0 ? c.slice(0, eq) : c,
      value: eq >= 0 ? c.slice(eq + 1) : ''
    };
  });
}

export function createSupabaseServerClient(request: Request, cookies: AstroCookies) {
  return createServerClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request);
        },
        setAll(cookiesToSet: Parameters<NonNullable<CookieMethodsServer['setAll']>>[0]) {
          for (const { name, value, options } of cookiesToSet) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cookies.set(name, value, options as any);
          }
        }
      }
    }
  );
}
