import type { SupabaseClient, User, Session } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { unauthorized, forbidden } from '@/lib/api-helpers'
import { createAstroServerClientFromRequest } from '@/lib/supabase'

type TypedClient = SupabaseClient<Database>

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

  // 1. Fast path: check app_metadata (server-controlled) or user_metadata (fallback)
  const jwtRole = (result.user.app_metadata?.role ?? result.user.user_metadata?.role) as string | undefined
  if (jwtRole && allowedRoles.includes(jwtRole as UserRole)) {
    return result
  }

  // 2. Reliability path: Fallback to database if JWT role is missing or invalid
  // This mitigates sync issues where Supabase Auth metadata doesn't match the profiles table.
  const { data: profile, error } = await result.supabase
    .from('profiles')
    .select('role')
    .eq('user_id', result.user.id)
    .maybeSingle()

  if (error || !profile?.role || !allowedRoles.includes(profile.role as UserRole)) {
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
