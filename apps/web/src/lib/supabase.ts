/**
 * Helper de Supabase para Astro SSR.
 * Crea clientes para uso en páginas (.astro) y endpoints del servidor.
 *
 * IMPORTANTE: Usar estas funciones en lugar de `@autamedica/auth/server`
 * en API routes de `apps/web`. En Cloudflare Pages el worker puede recibir
 * variables desde runtime (`locals.runtime.env`) y desde build-time.
 * Este helper resuelve ambas fuentes de forma consistente.
 */

import { createServerClient, type CookieMethodsServer } from '@supabase/ssr';
import type { Database } from '@autamedica/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';
import { resolvePublicSupabaseEnv, resolveServiceRoleKey } from './runtime-env';

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

export function createSupabaseServerClient(
  request: Request,
  cookies: AstroCookies,
  runtimeEnv?: Record<string, unknown> | null,
) {
  const { publicSupabaseUrl, publicSupabaseAnonKey } = resolvePublicSupabaseEnv(runtimeEnv);

  if (!publicSupabaseUrl || !publicSupabaseAnonKey) {
    throw new Error(
      `[createSupabaseServerClient] Missing env: PUBLIC_SUPABASE_URL=${!!publicSupabaseUrl}, ` +
        `PUBLIC_SUPABASE_ANON_KEY=${!!publicSupabaseAnonKey}.`,
    );
  }

  return createServerClient(
    publicSupabaseUrl,
    publicSupabaseAnonKey,
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
export function createAstroAdminClient(
  runtimeEnv?: Record<string, unknown> | null,
): SupabaseClient<Database> {
  const { publicSupabaseUrl } = resolvePublicSupabaseEnv(runtimeEnv);
  const serviceRoleKey = resolveServiceRoleKey(runtimeEnv);

  if (!publicSupabaseUrl || !serviceRoleKey) {
    throw new Error(
      `[createAstroAdminClient] Missing env: PUBLIC_SUPABASE_URL=${!!publicSupabaseUrl}, SUPABASE_SERVICE_ROLE_KEY=${!!serviceRoleKey}. ` +
      `Set SUPABASE_SERVICE_ROLE_KEY in apps/web/.env (dev) or as a Cloudflare Pages secret (prod).`
    );
  }

  return createServerClient<Database>(publicSupabaseUrl, serviceRoleKey, {
    cookies: { getAll: () => [], setAll: () => {} },
  }) as unknown as SupabaseClient<Database>;
}

/**
 * Crea un cliente Supabase desde un Request (usando cookies).
 * Wrapper sobre `@supabase/ssr` con `import.meta.env`.
 */
export function createAstroServerClientFromRequest(
  request: Request,
  runtimeEnv?: Record<string, unknown> | null,
): SupabaseClient<Database> {
  const { publicSupabaseUrl, publicSupabaseAnonKey } = resolvePublicSupabaseEnv(runtimeEnv);

  if (!publicSupabaseUrl || !publicSupabaseAnonKey) {
    throw new Error(
      `[createAstroServerClientFromRequest] Missing env: PUBLIC_SUPABASE_URL=${!!publicSupabaseUrl}, ` +
        `PUBLIC_SUPABASE_ANON_KEY=${!!publicSupabaseAnonKey}.`,
    );
  }

  return createServerClient<Database>(
    publicSupabaseUrl,
    publicSupabaseAnonKey,
    {
      cookies: {
        getAll: () => parseCookieHeader(request),
        setAll: () => {},
      },
    }
  ) as unknown as SupabaseClient<Database>;
}
