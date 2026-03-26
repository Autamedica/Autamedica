/**
 * Resolves patient context from an incoming Astro API request.
 * Astro-compatible replacement for the Next.js version that used next/headers.
 */

import { createAstroAdminClient, createAstroServerClientFromRequest } from '@/lib/supabase'
import { logger } from '@autamedica/shared'

export interface PatientContext {
  userId: string
  patientId: string
}

export async function resolvePatientContext(
  request: Request,
): Promise<PatientContext | null> {
  try {
    const supabase = createAstroServerClientFromRequest(request)

    // Parse cookies for debugging
    const rawCookies = request.headers.get('cookie') ?? ''
    const sbCookies = rawCookies.split(';')
      .map(c => c.trim().split('=')[0])
      .filter(n => n.startsWith('sb-'))
    logger.info('[resolvePatientContext] cookies received', { sbCookies, hasCookies: rawCookies.length > 0 })

    // 1. Get user from session (reads cookie data without server validation)
    let userId: string | null = null
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()
      userId = session?.user?.id ?? null
      if (sessionError) {
        logger.warn('[resolvePatientContext] getSession() error', { msg: sessionError.message })
      }
      logger.info('[resolvePatientContext] getSession result', { hasSession: !!session, userId })
    } catch (e) {
      logger.warn('[resolvePatientContext] getSession() threw', e)
    }

    // 2. Fallback to getUser() if session fails or is missing
    if (!userId) {
      try {
        const { data: { user: cookieUser }, error: cookieUserError } = await supabase.auth.getUser()
        userId = cookieUser?.id ?? null
        if (cookieUserError) {
          logger.warn('[resolvePatientContext] getUser() failed', { msg: cookieUserError.message })
        }
        logger.info('[resolvePatientContext] getUser result', { userId })
      } catch (e) {
        logger.warn('[resolvePatientContext] getUser() threw', e)
      }
    }

    // 3. Last fallback: Bearer token in Authorization header
    if (!userId) {
      const authHeader = request.headers.get('authorization')
      if (authHeader?.toLowerCase().startsWith('bearer ')) {
        const token = authHeader.slice(7)
        try {
          const adminClient = createAstroAdminClient()
          const { data: userRes, error: tokenUserError } = await adminClient.auth.getUser(token)
          if (!tokenUserError && userRes.user) {
            userId = userRes.user.id
          }
        } catch (error) {
          logger.warn('[resolvePatientContext] Bearer token lookup failed', error)
        }
      }
    }

    if (!userId) {
      return null
    }

    // 4. Resolve Patient ID (Admin bypass to ensure existence and prevent RLS edge cases during initial profile creation)
    const admin = createAstroAdminClient()

    // Try to find existing patient
    let { data: patient, error: patientError } = await admin
      .from('patients')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    // 5. If not found, ensure it's created (Self-healing logic)
    if (!patient && !patientError) {
      logger.info('[resolvePatientContext] Patient row not found, creating one for userId:', userId)
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
