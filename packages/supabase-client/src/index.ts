type CreateBrowserClientFn = typeof import('@autamedica/auth')['createBrowserClient'];
type CreateServerClientFn = typeof import('@autamedica/auth')['createServerClient'];

export type AppSupabaseClient = ReturnType<CreateBrowserClientFn>;
export type AppSupabaseServerClient = Awaited<ReturnType<CreateServerClientFn>>;

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
 * Get server client for SSR operations
 * Creates new instance with server-side cookie handling
 */
export async function getSupabaseServerClient(): Promise<AppSupabaseServerClient> {
  if (typeof window !== 'undefined') {
    throw new Error('getSupabaseServerClient() can only be used in server context');
  }

  // Dynamic import to avoid bundling server code in client
  const { createServerClient } = await import('@autamedica/auth');
  return createServerClient();
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
