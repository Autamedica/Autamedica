/**
 * @fileoverview Centralized Supabase client for browser environments
 */

import type { Database } from '@autamedica/types'
import { createBrowserClient as createSupabaseBrowserClient, type CookieOptions } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getDomainConfig, getSessionConfig, getSupabaseConfig } from '../utils/config'

let supabaseClient: SupabaseClient<Database> | null = null

/**
 * Create or get the Supabase browser client
 * Singleton pattern to ensure only one client instance
 */
export function createBrowserClient(): SupabaseClient<Database> {
  // Return existing client if already created
  if (supabaseClient) {
    return supabaseClient
  }

  // Server-side protection
  if (typeof window === 'undefined') {
    throw new Error('createBrowserClient must only be called in browser environment')
  }

  const { url, anonKey } = getSupabaseConfig()
  const sessionConfig = getSessionConfig()
  const domainConfig = getDomainConfig()

  // Create the client with SSO cookie configuration
  supabaseClient = createSupabaseBrowserClient<Database>(url, anonKey, {
    cookies: {
      get(name: string) {
        // Use js-cookie for better cross-domain support
        if (typeof window !== 'undefined') {
          const cookies = document.cookie.split('; ')
          const cookie = cookies.find(c => c.startsWith(`${name}=`))
          return cookie ? decodeURIComponent(cookie.split('=')[1] || '') : undefined
        }
        return undefined
      },
      set(name: string, value: string, options: CookieOptions) {
        if (typeof window !== 'undefined') {
          // Set cookie with domain for SSO
          const cookieOptions = [
            `${name}=${encodeURIComponent(value)}`,
            `path=/`,
            `domain=${domainConfig.cookie}`,
            `max-age=${options.maxAge || sessionConfig.maxAge}`,
            `SameSite=Lax`,
            // Add Secure flag for production (HTTPS)
            process.env.NODE_ENV === 'production' ? `Secure` : '',
          ].filter(Boolean) // Remove empty strings

          document.cookie = cookieOptions.join('; ')
        }
      },
      remove(name: string) {
        if (typeof window !== 'undefined') {
          // Remove cookie from all possible domains
          const domains = [
            domainConfig.cookie,
            `.${domainConfig.base}`,
            domainConfig.base,
            'localhost'
          ]

          domains.forEach(domain => {
            document.cookie = `${name}=; path=/; domain=${domain}; expires=Thu, 01 Jan 1970 00:00:00 GMT`
          })
        }
      }
    },
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      // Disable Web Locks: each portal runs on a separate origin so cross-tab
      // locking provides no benefit. Without this, competing lock requests
      // between tabs throw "AbortError: Lock broken by another request with
      // the 'steal' option" as unhandled promise rejections.
      // @ts-expect-error -- lock is available in @supabase/auth-js but not
      // typed in the @supabase/ssr createBrowserClient options yet
      lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<unknown>) => fn(),
    }
  }) as unknown as SupabaseClient

  return supabaseClient as SupabaseClient<Database>
}

/**
 * Get the existing Supabase client or create a new one
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (!supabaseClient) {
    return createBrowserClient()
  }
  return supabaseClient
}

/**
 * Sign out and clear all sessions across apps
 */
export async function signOutGlobally(): Promise<void> {
  const client = getSupabaseClient()
  const domainConfig = getDomainConfig()

  // Sign out from Supabase
  await client.auth.signOut()

  // Clear all auth-related cookies
  const authCookies = [
    'autamedica_session',
    'sb-access-token',
    'sb-refresh-token',
    'sb-auth-token'
  ]

  authCookies.forEach(cookieName => {
    // Clear from all possible domains
    const domains = [
      domainConfig.cookie,
      `.${domainConfig.base}`,
      domainConfig.base,
      'localhost'
    ]

    domains.forEach(domain => {
      document.cookie = `${cookieName}=; path=/; domain=${domain}; expires=Thu, 01 Jan 1970 00:00:00 GMT`
    })
  })

  // Clear localStorage
  if (typeof window !== 'undefined') {
    const keysToRemove = Object.keys(localStorage).filter(key =>
      key.includes('supabase') || key.includes('autamedica')
    )
    keysToRemove.forEach(key => localStorage.removeItem(key))
  }
}