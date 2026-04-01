/**
 * @fileoverview Centralized Supabase client for browser environments
 */

import type { Database } from '@autamedica/types'
import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getDomainConfig, getSupabaseConfig } from '../utils/config'

let supabaseClient: SupabaseClient<Database> | null = null
const authLockQueue = new Map<string, Promise<void>>()

/**
 * Circuit breaker: after a definitive refresh-token failure (400 — token
 * revoked/expired/not found), stop queuing further auth operations and
 * clear the corrupted local session once.
 *
 * Resets on a successful auth operation so normal login flow isn't blocked.
 */
let authCircuitOpen = false

/**
 * Serialize auth operations without relying on the browser Web Locks API.
 *
 * We previously used a no-op lock to avoid `AbortError` issues from `navigator.locks`,
 * but that also let Supabase run concurrent refresh flows against the same session.
 * The result was repeated `refresh_token` calls and eventual 429 rate limits.
 *
 * An in-memory queue keeps auth init/refresh serialized per browser context while
 * still avoiding the Web Locks API entirely.
 */
export async function runWithSerializedAuthLock<T>(
  name: string,
  _acquireTimeout: number,
  fn: () => Promise<T>,
): Promise<T> {
  // Circuit breaker: if a previous refresh already failed definitively,
  // skip further queued operations to prevent the 400-spam loop.
  if (authCircuitOpen) {
    throw new Error('Auth circuit breaker open: refresh token is invalid')
  }

  const previous = authLockQueue.get(name) ?? Promise.resolve()
  let releaseCurrent!: () => void

  const current = new Promise<void>((resolve) => {
    releaseCurrent = () => resolve()
  })

  const currentQueue = previous.catch(() => undefined).then(() => current)
  authLockQueue.set(name, currentQueue)

  await previous.catch(() => undefined)

  try {
    const result = await fn()
    // Successful operation — close the circuit breaker if it was tripped.
    authCircuitOpen = false
    return result
  } catch (error) {
    // Detect definitive refresh-token failure and trip the breaker.
    if (
      error instanceof Error &&
      /refresh.token|invalid.*token/i.test(error.message) &&
      ('status' in error && (error as { status: number }).status === 400)
    ) {
      authCircuitOpen = true
    }
    throw error
  } finally {
    releaseCurrent()

    if (authLockQueue.get(name) === currentQueue) {
      authLockQueue.delete(name)
    }
  }
}

/** Reset the auth circuit breaker (e.g. after a successful sign-in). */
export function resetAuthCircuitBreaker(): void {
  authCircuitOpen = false
}

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
  const domainConfig = getDomainConfig()

  // Use @supabase/ssr's built-in document.cookie handling (cookieOptions path).
  // This is the modern API (v0.5+) — avoids the deprecated get/set/remove adapter.
  // The cookieOptions.domain enables cross-subdomain SSO (.autamedica.com).
  supabaseClient = createSupabaseBrowserClient<Database>(url, anonKey, {
    cookieOptions: {
      domain: domainConfig.cookie,
      secure: window.location.protocol === 'https:',
      sameSite: 'lax',
      path: '/',
    },
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      // Keep refresh/auth init serialized without depending on navigator.locks.
      // This avoids the browser AbortError we saw with Web Locks while still
      // preventing concurrent refresh-token requests from the same app instance.
      lock: runWithSerializedAuthLock,
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
  // Reset circuit breaker so the next login attempt works normally.
  authCircuitOpen = false
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
