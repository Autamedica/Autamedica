type CreateBrowserClientFn = typeof import('@autamedica/auth')['createBrowserClient'];

export type AppSupabaseClient = ReturnType<CreateBrowserClientFn>;

let browserClient: AppSupabaseClient | null = null;

/**
 * Get browser client for client-side operations
 * Singleton pattern to reuse same instance
 */
export function getSupabaseBrowserClient(): AppSupabaseClient {
  if (typeof window === 'undefined') {
    throw new Error('getSupabaseBrowserClient() can only be used in browser context');
  }

  if (!browserClient) {
    // Require root export to avoid fragile subpath resolution during package builds.
     
    const { createBrowserClient } = require('@autamedica/auth') as {
      createBrowserClient: CreateBrowserClientFn;
    };
    browserClient = createBrowserClient();
  }

  return browserClient;
}

/**
 * Obtiene el cliente de navegador sin lanzar excepción en entornos SSR.
 * Retorna null cuando se invoca fuera del browser.
 */
export function getOptionalSupabaseBrowserClient(): AppSupabaseClient | null {
  return typeof window === 'undefined' ? null : getSupabaseBrowserClient();
}

/**
 * Universal client getter
 * Automatically detects environment and returns appropriate client
 */
export function getSupabaseClient(): AppSupabaseClient {
  if (typeof window === 'undefined') {
    throw new Error(
      'getSupabaseClient() cannot be used in SSR. Use getSupabaseServerClient() instead.'
    );
  }

  return getSupabaseBrowserClient();
}
