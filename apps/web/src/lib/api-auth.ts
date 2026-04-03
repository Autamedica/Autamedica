import type { SupabaseClient, User, Session } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { unauthorized } from '@/lib/api-helpers'
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
