/**
 * Resolves patient context from an incoming Astro API request.
 *
 * IMPORTANT: Prefer passing `locals` from the Astro context.
 * The middleware already validated the session and stored it in locals.session.
 * Re-creating a Supabase client from cookies alone fails when the access token
 * expires because the API endpoint can't write refreshed tokens back (setAll is no-op).
 *
 * With locals: uses the already-validated session -> no re-auth, no refresh needed.
 * Without locals: falls back to cookie-based auth (legacy, for backwards compat).
 */

import { createAstroAdminClient, createAstroServerClientFromRequest } from '@/lib/supabase'
import { logger } from '@autamedica/shared'

export interface PatientContext {
  userId: string
  patientId: string
}

/** Astro locals shape (set by middleware) */
interface AstroLocals {
  session?: { user?: { id?: string; user_metadata?: Record<string, unknown> } } | null
  supabase?: unknown
  runtime?: { env?: Record<string, unknown> }
}

const PATIENT_ALLOWED_ROLES = new Set(['patient', 'organization_admin', 'platform_admin', 'admin'])

function extractRole(metadata: Record<string, unknown> | undefined): string | undefined {
  const raw = metadata?.role
  return typeof raw === 'string' ? raw : undefined
}

function getRequestAuthDebug(request: Request): {
  hasAuthorizationHeader: boolean
  hasAuthCookies: boolean
  authCookieNames: string[]
} {
  const rawCookieHeader = request.headers.get('cookie') ?? ''
  const authCookieNames = rawCookieHeader
    .split('; ')
    .map((entry) => entry.split('=')[0])
    .filter((name) => name.startsWith('sb-'))

  return {
    hasAuthorizationHeader: Boolean(request.headers.get('authorization')),
    hasAuthCookies: authCookieNames.length > 0,
    authCookieNames,
  }
}

export async function resolvePatientContext(
  request: Request,
  locals?: AstroLocals,
): Promise<PatientContext | null> {
  try {
    const authDebug = getRequestAuthDebug(request)
    // 1. PREFERRED: Use middleware-validated session from locals
    let userId: string | null = null
    let userRole = extractRole(locals?.session?.user?.user_metadata)

    if (locals?.session?.user?.id) {
      userId = locals.session.user.id
    }

    // 2. Fallback: Parse cookies and create a Supabase client
    // This path has the refresh problem -- it works only within the 1-hour access token window.
    if (!userId) {
      const supabase = createAstroServerClientFromRequest(request, locals?.runtime?.env)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        userId = session?.user?.id ?? null
        if (!userRole && session?.user?.user_metadata) {
          userRole = extractRole(session.user.user_metadata as Record<string, unknown>)
        }
      } catch {
        logger.warn('[resolvePatientContext] getSession() threw', authDebug)
      }

      if (!userId) {
        try {
          const { data: { user }, error } = await supabase.auth.getUser()
          userId = user?.id ?? null
          if (!userRole && user?.user_metadata) {
            userRole = extractRole(user.user_metadata as Record<string, unknown>)
          }
          if (error) {
            logger.warn('[resolvePatientContext] getUser() failed', {
              msg: error.message,
              ...authDebug,
            })
          }
        } catch {
          logger.warn('[resolvePatientContext] getUser() threw', authDebug)
        }
      }
    }

    // 3. Last fallback: Bearer token in Authorization header
    if (!userId) {
      const authHeader = request.headers.get('authorization')
      if (authHeader?.toLowerCase().startsWith('bearer ')) {
        const token = authHeader.slice(7)
        try {
          const adminClient = createAstroAdminClient(locals?.runtime?.env)
          const { data: userRes, error: tokenUserError } = await adminClient.auth.getUser(token)
          if (!tokenUserError && userRes.user) {
            userId = userRes.user.id
            if (!userRole && userRes.user.user_metadata) {
              userRole = extractRole(userRes.user.user_metadata as Record<string, unknown>)
            }
          }
        } catch (error) {
          logger.warn('[resolvePatientContext] Bearer token lookup failed', error)
        }
      }
    }

    if (!userId) {
      logger.info('[resolvePatientContext] Unable to resolve userId from request auth context', {
        hasLocalsSession: Boolean(locals?.session?.user?.id),
        ...authDebug,
      })
      return null
    }

    if (!userRole || !PATIENT_ALLOWED_ROLES.has(userRole)) {
      logger.info('[resolvePatientContext] User role does not grant patient access', {
        userId,
        role: userRole ?? 'none',
      })
      return null
    }

    // 4. Resolve Patient ID
    const admin = createAstroAdminClient(locals?.runtime?.env)

    let { data: patient, error: patientError } = await admin
      .from('patients')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    // 5. Auto-create patient record only for users with the 'patient' role.
    // Admin roles can look up existing patient records but should not trigger creation.
    if (!patient && !patientError && userRole === 'patient') {
      logger.info('[resolvePatientContext] Patient row not found, creating one for patient-role userId:', userId)
      const { data: insertedPatient, error: insertPatientError } = await admin
        .from('patients')
        .upsert({ user_id: userId, active: true }, { onConflict: 'user_id' })
        .select('id')
        .maybeSingle()

      if (insertPatientError) {
        logger.error('[resolvePatientContext] Failed to auto-create patient row', insertPatientError)
        return null
      }
      patient = insertedPatient
    }

    const patientId = (patient as { id: string } | null)?.id ?? null

    if (patientError || !patientId) {
      logger.error('[resolvePatientContext] Critical failure resolving patientId', { userId, patientError })
      return null
    }

    return { userId, patientId }
  } catch (error) {
    logger.error('[resolvePatientContext] Unhandled error', error)
    return null
  }
}
