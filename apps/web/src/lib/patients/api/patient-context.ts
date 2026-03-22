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
  const {
    data: { user: cookieUser },
    error: cookieUserError,
  } = await supabase.auth.getUser()

  let userId = cookieUser?.id ?? null

  if (cookieUserError || !userId) {
    const authHeader = request.headers.get('authorization')

    if (authHeader?.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.slice(7)
      try {
        const admin = createAdminClient()
        const { data: userRes, error: tokenUserError } = await admin.auth.getUser(token)
        if (!tokenUserError && userRes.user) {
          userId = userRes.user.id
        }
      } catch (error) {
        logger.warn('[resolvePatientContext] Bearer token lookup failed', error)
      }
    }
  }

  if (!userId) return null

  const { data: scopedPatient, error: scopedPatientError } = await supabase
    .from('patients')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  const scopedPatientId = (scopedPatient as { id: string } | null)?.id ?? null
  if (scopedPatientId) {
    return { userId, patientId: scopedPatientId }
  }

  if (scopedPatientError) {
    logger.warn('[resolvePatientContext] User-scoped patient lookup failed', scopedPatientError)
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (error) {
    logger.warn('[resolvePatientContext] Admin client unavailable', error)
    return null
  }

  let { data: patient, error: patientError } = await admin
    .from('patients')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (!patient && !patientError) {
    const { data: insertedPatient, error: insertPatientError } = await admin
      .from('patients')
      .upsert({ user_id: userId, active: true } as never, { onConflict: 'user_id' })
      .select('id')
      .maybeSingle()

    patient = insertedPatient
    patientError = insertPatientError
  }

  const patientId = (patient as { id: string } | null)?.id ?? null

  if (patientError || !patientId) {
    logger.warn('[resolvePatientContext] Failed to resolve patient row', patientError)
    return null
  }

  return { userId, patientId }
}
