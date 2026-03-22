/**
 * Cliente Supabase para browser
 *
 * Re-exports the singleton browser client from client/supabase.ts which
 * includes the no-op lock (prevents GoTrue lock contention), custom cookie
 * handling for SSO, and localStorage storage fallback.
 */

"use client";

import { ensureClientEnv } from "@autamedica/shared";
import type { Provider } from "@supabase/supabase-js";
import { createBrowserClient, getSupabaseClient, signOutGlobally } from "./client/supabase";

export { createBrowserClient, getSupabaseClient, signOutGlobally };

/**
 * Inicia sesión con OAuth usando URLs de producción correctas
 * @param provider Proveedor OAuth (google, github, etc.)
 * @param portal Portal de destino (opcional)
 * @returns Promise con resultado de la operación
 */
export async function signInWithOAuth(
  provider: Provider,
  portal?: "patients" | "doctors" | "companies" | "admin"
) {
  const supabase = createBrowserClient();

  const callbackUrl = ensureClientEnv('PUBLIC_AUTH_CALLBACK_URL');

  // Construir URL completa con parámetros
  const redirectUrl = new URL(callbackUrl);
  if (portal) {
    redirectUrl.searchParams.set('portal', portal);
  }

  return await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectUrl.toString()
    }
  });
}