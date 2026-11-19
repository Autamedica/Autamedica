import type { SupabaseClient, User, Session } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { unauthorized, forbidden, jsonFail } from '@/lib/api-helpers'
import { createAstroAdminClient, createAstroServerClientFromRequest } from '@/lib/supabase'

type TypedClient = SupabaseClient<Database>
type ApiKeyRow = {
  id: string
  key_prefix: string
  scopes: string[]
  belongs_to: string | null
  expires_at: string | null
  revoked_at: string | null
}

export interface AuthedRequest {
  user: User
  supabase: TypedClient
}

export interface SessionRequest {
  session: Session
  supabase: TypedClient
}

/**
 * Authenticate a request via `getUser()` (secure — validates JWT with Supabase Auth).
 * Returns the authenticated user + Supabase client, or an `unauthorized()` Response.
 */
export async function withAuth(
  request: Request,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  locals?: { runtime?: { env?: any } }
): Promise<AuthedRequest | Response> {
  if (import.meta.env.DEV && import.meta.env.AUTH_BYPASS === 'true') {
    const supabase = createAstroAdminClient(locals?.runtime?.env)
    const user: User = {
      id: "7fd7ae56-bdae-4a20-9057-71dfd74e3e28",
      aud: "authenticated",
      role: "authenticated",
      email: "bounced_dr.garcia@autamedica.com",
      app_metadata: { provider: "email", role: "doctor" },
      user_metadata: {
        role: "doctor",
        first_name: "Carlos",
        last_name: "Garcia",
        specialties: ["Medicina General"],
        medical_license: "MP-DEMO-12345"
      },
      created_at: "2026-04-29T16:51:57.095014+00:00",
      updated_at: "2026-05-24T09:17:38.019784+00:00"
    }
    return { user, supabase }
  }

  let supabase: TypedClient
  try {
    supabase = createAstroServerClientFromRequest(request, locals?.runtime?.env)
  } catch {
    return unauthorized()
  }

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return unauthorized()

  return { user, supabase }
}

type UserRole = 'patient' | 'doctor' | 'pharmacist' | 'admin' | 'company' | 'company_admin' | 'organization_admin' | 'platform_admin'

/** Roles allowed to access doctor endpoints */
export const DOCTOR_ROLES: UserRole[] = ['doctor', 'organization_admin', 'platform_admin', 'admin']

/** Roles allowed to access patient endpoints */
export const PATIENT_ROLES: UserRole[] = ['patient', 'organization_admin', 'platform_admin', 'admin']

/** Roles allowed to access pharmacy endpoints */
export const PHARMACIST_ROLES: UserRole[] = ['pharmacist', 'platform_admin', 'admin']

/** Roles allowed to access admin endpoints */
export const ADMIN_ROLES: UserRole[] = ['organization_admin', 'platform_admin', 'admin']

/**
 * Authenticate a request AND verify the user has one of the allowed roles.
 * Returns 401 if not authenticated, 403 if role doesn't match.
 *
 * Performance: Checks role in JWT metadata first (fast).
 * Reliability: Fallback to database (profiles table) if metadata is missing or outdated.
 */
export async function withAuthRole(
  request: Request,
  allowedRoles: UserRole[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  locals?: { runtime?: { env?: any } },
): Promise<AuthedRequest | Response> {
  const result = await withAuth(request, locals)
  if (result instanceof Response) return result

  // Clinical role revocations apply immediately, even while an old JWT remains valid.
  const { data: profile, error } = await result.supabase
    .from('profiles')
    .select('role, active')
    .eq('user_id', result.user.id)
    .maybeSingle()

  if (error || !profile?.active || !profile.role || !allowedRoles.includes(profile.role as UserRole)) {
    return forbidden()
  }

  return result
}

/**
 * Authenticate a request via `getSession()` (reads JWT from cookie, no Supabase roundtrip).
 * Returns the session + Supabase client, or an `unauthorized()` Response.
 */
export async function withSession(
  request: Request,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  locals?: { runtime?: { env?: any } }
): Promise<SessionRequest | Response> {
  if (import.meta.env.DEV && import.meta.env.AUTH_BYPASS === 'true') {
    const supabase = createAstroAdminClient(locals?.runtime?.env)
    const session: Session = {
      access_token: "mock-access-token",
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: "mock-refresh-token",
      user: {
        id: "7fd7ae56-bdae-4a20-9057-71dfd74e3e28",
        aud: "authenticated",
        role: "authenticated",
        email: "bounced_dr.garcia@autamedica.com",
        app_metadata: { provider: "email", role: "doctor" },
        user_metadata: {
          role: "doctor",
          first_name: "Carlos",
          last_name: "Garcia",
          specialties: ["Medicina General"],
          medical_license: "MP-DEMO-12345"
        },
        created_at: "2026-04-29T16:51:57.095014+00:00",
        updated_at: "2026-05-24T09:17:38.019784+00:00"
      }
    }
    return { session, supabase }
  }

  let supabase: TypedClient
  try {
    supabase = createAstroServerClientFromRequest(request, locals?.runtime?.env)
  } catch {
    return unauthorized()
  }

  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session) return unauthorized()

  return { session, supabase }
}

/**
 * Type guard: check whether `withAuth` / `withSession` returned success or a Response.
 */
export function isAuthed<T extends AuthedRequest | SessionRequest>(
  result: T | Response,
): result is T {
  return !(result instanceof Response)
}

// ==========================================
// API Key Authentication (B2B / external services)
// ==========================================
export interface ApiKeyRequest {
  apiKeyId: string
  keyPrefix: string
  scopes: string[]
  belongsTo: string | null
  supabase: TypedClient
}

export function apiKeyHasScope(apiKey: ApiKeyRequest, scope: string): boolean {
  return apiKey.scopes.includes('*') || apiKey.scopes.includes(scope)
}

/**
 * Validates an API key from the X-API-Key header.
 * Returns the key metadata + Supabase client, or null if no API key present.
 * Returns a Response (401) if the key is invalid/revoked/expired.
 */
export async function withApiKey(
  request: Request,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  locals?: { runtime?: { env?: any } }
): Promise<ApiKeyRequest | null | Response> {
  const apiKey = request.headers.get('X-API-Key')
  if (!apiKey) return null

  // Hash key for lookup
  const crypto = await import('node:crypto')
  const hash = crypto.createHash('sha256').update(apiKey).digest('hex')

  let supabase: TypedClient
  try {
    supabase = createAstroAdminClient(locals?.runtime?.env)
  } catch {
    return null
  }

  const apiKeyTable = supabase.from('api_keys' as never) as unknown as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: ApiKeyRow | null; error: unknown }>
      }
    }
  }

  const { data: key, error } = await apiKeyTable
    .select('id, key_prefix, scopes, belongs_to, expires_at, revoked_at')
    .eq('key_hash', hash)
    .maybeSingle()

  if (error || !key) {
    return jsonFail('UNAUTHENTICATED', 'invalid api key', 401)
  }

  if (key.revoked_at) {
    return jsonFail('UNAUTHENTICATED', 'api key revoked', 401)
  }

  if (key.expires_at && new Date(key.expires_at) < new Date()) {
    return jsonFail('UNAUTHENTICATED', 'api key expired', 401)
  }

  // Update last_used_at (fire-and-forget)
  ;(supabase.from('api_keys' as never) as unknown as {
    update: (patch: { last_used_at: string }) => {
      eq: (column: string, value: string) => Promise<unknown>
    }
  })
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', key.id)
    .then(() => {})

  return {
    apiKeyId: key.id,
    keyPrefix: key.key_prefix,
    scopes: key.scopes,
    belongsTo: key.belongs_to,
    supabase,
  }
}

/**
 * Authenticate via API key OR user session. Tries API key first, then session.
 * Returns the authenticated context or a Response (401/403).
 */
export async function withAuthOrApiKey(
  request: Request,
  allowedRoles?: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  locals?: { runtime?: { env?: any } }
): Promise<{ user: User; supabase: TypedClient } | { apiKey: ApiKeyRequest } | Response> {
  // 1. Try API key first
  const apiKeyResult = await withApiKey(request, locals)
  if (apiKeyResult instanceof Response) return apiKeyResult
  if (apiKeyResult) return { apiKey: apiKeyResult }

  // 2. Fall back to user session
  if (allowedRoles) {
    return withAuthRole(request, allowedRoles as any, locals)
  }
  return withAuth(request, locals)
}

