/**
 * Cliente Supabase para server-side
 *
 * Este módulo provee clientes Supabase configurados para uso en server-side
 * con manejo seguro de cookies y sesiones.
 */

import { ensureServerEnv } from "@autamedica/shared";
import type { Database } from "@autamedica/types";
import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

function readSupabaseUrl(): string {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ensureServerEnv("SUPABASE_URL");
}

function readSupabaseAnonKey(): string {
  return (
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ensureServerEnv("SUPABASE_ANON_KEY")
  );
}

/**
 * Crea un cliente Supabase para Server Components y Server Actions
 *
 * IMPORTANTE: En Next.js 15+, cookies() es asíncrono y debe ser awaited
 */
export async function createServerClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  return createSupabaseServerClient<Database>(
    readSupabaseUrl(),
    readSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // El método `setAll` no funciona en Server Components.
            // Solo funciona en Server Actions y Route Handlers.
          }
        },
      },
    }
  ) as unknown as SupabaseClient<Database>;
}

/**
 * Crea un cliente Supabase para middleware
 */
export function createMiddlewareClient(request: NextRequest) {
  const supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createSupabaseServerClient<Database>(
    readSupabaseUrl(),
    readSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  return { supabase, response: supabaseResponse };
}

/**
 * Crea un cliente Supabase para Route Handlers (API Routes)
 */
export async function createRouteHandlerClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  return createSupabaseServerClient<Database>(
    readSupabaseUrl(),
    readSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  ) as unknown as SupabaseClient<Database>;
}

/**
 * Crea un cliente Supabase con privilegios administrativos (service_role)
 * NUNCA usar en el cliente. Solo para operaciones internas del servidor.
 */
export function createAdminClient(): SupabaseClient<Database> {
  // Cast needed: @supabase/ssr@0.5.2 generates SupabaseClient<D, SchemaName, Schema> (3 params)
  // but @supabase/supabase-js@2.57.4 uses SupabaseClient<D, SchemaNameOrOptions, SchemaName, Schema, ClientOptions> (5 params)
  // At runtime the object is the correct SupabaseClient with Database["public"] as schema.
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
