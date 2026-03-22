/**
 * Cliente Supabase para server-side (framework-agnostic)
 *
 * Provee un core basado en Web API (CookieAdapter) que funciona con
 * cualquier framework (Astro, Hono, etc).
 */

import { ensureServerEnv } from "@autamedica/shared";
import type { Database } from "@autamedica/types";
import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Cookie adapter interface (framework-agnostic)
// ---------------------------------------------------------------------------

export interface CookieAdapter {
  getAll(): Array<{ name: string; value: string }>;
  setAll(cookies: Array<{ name: string; value: string; options?: Record<string, unknown> }>): void;
}

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

function readSupabaseUrl(): string {
  return (
    process.env.SUPABASE_URL ??
    process.env.PUBLIC_SUPABASE_URL ??
    ensureServerEnv("SUPABASE_URL")
  );
}

function readSupabaseAnonKey(): string {
  return (
    process.env.SUPABASE_ANON_KEY ??
    process.env.PUBLIC_SUPABASE_ANON_KEY ??
    ensureServerEnv("SUPABASE_ANON_KEY")
  );
}

// Re-export for consumers that need the raw values
export { readSupabaseUrl, readSupabaseAnonKey };

// ---------------------------------------------------------------------------
// Framework-agnostic core
// ---------------------------------------------------------------------------

/**
 * Crea un cliente Supabase con un adaptador de cookies genérico.
 * Funciona con cualquier framework (Astro, Next.js, Hono, etc).
 */
export function createServerClientWithCookies(
  cookies: CookieAdapter
): SupabaseClient<Database> {
  return createSupabaseServerClient<Database>(
    readSupabaseUrl(),
    readSupabaseAnonKey(),
    {
      cookies: {
        getAll: () => cookies.getAll(),
        setAll: (cookiesToSet) => cookies.setAll(cookiesToSet),
      },
    }
  ) as unknown as SupabaseClient<Database>;
}

/**
 * Crea un cliente Supabase para un Request estándar (Web API).
 * Parsea cookies del header y opcionalmente escribe en un callback.
 */
export function createServerClientFromRequest(
  request: Request,
  setCookie?: (name: string, value: string, options?: Record<string, unknown>) => void
): SupabaseClient<Database> {
  return createServerClientWithCookies({
    getAll() {
      const cookieHeader = request.headers.get('cookie') ?? '';
      if (!cookieHeader) return [];
      return cookieHeader.split('; ').map(c => {
        const eq = c.indexOf('=');
        return {
          name: eq >= 0 ? c.slice(0, eq) : c,
          value: eq >= 0 ? c.slice(eq + 1) : ''
        };
      });
    },
    setAll(cookiesToSet) {
      if (setCookie) {
        for (const { name, value, options } of cookiesToSet) {
          setCookie(name, value, options);
        }
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Admin client (no cookies, framework-agnostic)
// ---------------------------------------------------------------------------

/**
 * Crea un cliente Supabase con privilegios administrativos (service_role).
 * NUNCA usar en el cliente. Solo para operaciones internas del servidor.
 */
export function createAdminClient(): SupabaseClient<Database> {
  return createSupabaseServerClient<Database>(
    readSupabaseUrl(),
    ensureServerEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // No operation
        },
      },
    }
  ) as unknown as SupabaseClient<Database>;
}
