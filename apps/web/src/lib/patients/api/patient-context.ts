/**
 * Resolves patient context from an incoming Astro API request.
 * Astro-compatible replacement for the Next.js version that used next/headers.
 */

import { createAdminClient, createServerClientFromRequest } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'

export interface PatientContext {
  userId: string
  patientId: string
}

export async function resolvePatientContext(
  request: Request,
): Promise<PatientContext | null> {
  const supabase = createServerClientFromRequest(request)
  
  // 1. Get user from session (more robust for SSR than getUser() in some scenarios)
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  let userId = session?.user?.id ?? null

  // 2. Fallback to getUser() if session fails or is missing
  if (!userId) {
    const { data: { user: cookieUser }, error: cookieUserError } = await supabase.auth.getUser()
    userId = cookieUser?.id ?? null
    
    if (cookieUserError) {
      logger.warn('[resolvePatientContext] cookie getUser() failed', cookieUserError)
    }
  }

  // 3. Last fallback: Bearer token in Authorization header
  if (!userId) {
    const authHeader = request.headers.get('authorization')
    if (authHeader?.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.slice(7)
      try {
        const adminClient = createAdminClient()
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
    logger.warn('[resolvePatientContext] No user ID resolved from request')
    return null
  }

  // 4. Resolve Patient ID (Admin bypass to ensure existence and prevent RLS edge cases during initial profile creation)
  const admin = createAdminClient()
  
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
}
