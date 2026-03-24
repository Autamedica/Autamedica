import type { SupabaseClient, User, Session } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { createServerClientFromRequest } from '@autamedica/auth/server'
import { unauthorized } from '@/lib/api-helpers'

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
export async function withAuth(request: Request): Promise<AuthedRequest | Response> {
  let supabase: TypedClient
  try {
    supabase = createServerClientFromRequest(request)
  } catch {
    return unauthorized()
  }

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return unauthorized()

  return { user, supabase }
}

/**
 * Authenticate a request via `getSession()` (reads JWT from cookie, no Supabase roundtrip).
 * Returns the session + Supabase client, or an `unauthorized()` Response.
 */
export async function withSession(request: Request): Promise<SessionRequest | Response> {
  let supabase: TypedClient
  try {
    supabase = createServerClientFromRequest(request)
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
