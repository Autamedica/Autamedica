/**
 * Helper de Supabase para Astro SSR.
 * Crea clientes para uso en páginas (.astro) y endpoints del servidor.
 *
 * IMPORTANTE: Usar estas funciones en lugar de `@autamedica/auth/server`
 * en API routes de `apps/web`. La razón: `@autamedica/auth/server` usa
 * `process.env` que NO está disponible en Cloudflare Pages — solo
 * `import.meta.env` funciona de forma confiable en Astro + Cloudflare.
 */

import { createServerClient, type CookieMethodsServer } from '@supabase/ssr';
import type { Database } from '@autamedica/types';
import type { SupabaseClient } from '@supabase/supabase-js';
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

/**
 * Crea un cliente Supabase con privilegios de servicio (service_role).
 * Usa `import.meta.env` — funciona en Cloudflare Pages y en dev local.
 *
 * SOLO para API routes del servidor. NUNCA exponer al cliente.
 */
export function createAstroAdminClient(): SupabaseClient<Database> {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    import.meta.env.SUPABASE_SERVICE_ROLE_KEY ??
    // Fallback a process.env para entornos Node.js puros (tests, scripts)
    (typeof process !== 'undefined' ? process.env.SUPABASE_SERVICE_ROLE_KEY : undefined);

  if (!url || !serviceRoleKey) {
    throw new Error(
      `[createAstroAdminClient] Missing env: PUBLIC_SUPABASE_URL=${!!url}, SUPABASE_SERVICE_ROLE_KEY=${!!serviceRoleKey}. ` +
      `Set SUPABASE_SERVICE_ROLE_KEY in apps/web/.env (dev) or as a Cloudflare Pages secret (prod).`
    );
  }

  return createServerClient<Database>(url, serviceRoleKey, {
    cookies: { getAll: () => [], setAll: () => {} },
  }) as unknown as SupabaseClient<Database>;
}

/**
 * Crea un cliente Supabase desde un Request (usando cookies).
 * Wrapper sobre `@supabase/ssr` con `import.meta.env`.
 */
export function createAstroServerClientFromRequest(request: Request): SupabaseClient<Database> {
  return createServerClient<Database>(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => parseCookieHeader(request),
        setAll: () => {},
      },
    }
  ) as unknown as SupabaseClient<Database>;
}
