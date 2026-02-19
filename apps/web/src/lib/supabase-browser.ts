import { createBrowserClient } from '@supabase/ssr';

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getBrowserSupabaseClient() {
  if (typeof window === 'undefined') {
    throw new Error('getBrowserSupabaseClient can only be called in the browser');
  }

  if (!browserClient) {
    browserClient = createBrowserClient(
      import.meta.env.PUBLIC_SUPABASE_URL,
      import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce',
        },
        global: {
          headers: {
            'X-Client-Info': '@autamedica/web-auth',
          },
        },
      }
    );
  }

  return browserClient;
}
