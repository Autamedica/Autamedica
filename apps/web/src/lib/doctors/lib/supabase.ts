'use client';

import {
  AppSupabaseClient,
  getOptionalSupabaseBrowserClient,
} from '@autamedica/supabase-client';

export function createClient(): AppSupabaseClient | null {
  return getOptionalSupabaseBrowserClient();
}

// Lazy getter para evitar ejecución en build time
export function getSupabase() {
  return createClient();
}

// Export para compatibilidad con imports existentes
// IMPORTANTE: Este NO se ejecuta en build time porque está en un módulo 'use client'
export const supabase: {
  readonly auth: AppSupabaseClient['auth'] | { getUser: () => Promise<{ data: { user: null }; error: null }> };
  readonly from: AppSupabaseClient['from'] | (() => { select: () => { eq: () => { single: () => Promise<{ data: null; error: null }> } } });
} = {
  get auth() {
    const client = createClient();
    return client?.auth || { getUser: async () => ({ data: { user: null }, error: null }) };
  },
  get from() {
    const client = createClient();
    const from = client?.from;
    if (from) {
      return from.bind(client);
    }
    return () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) });
  },
};
