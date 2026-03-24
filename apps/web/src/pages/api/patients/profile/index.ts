import type { APIRoute } from 'astro'
import { getUserIdFromRequest } from '@/lib/patients/api/auth'
import { buildPatientContext, persistPatientContextFiles } from '@/lib/patients/lib/ai/context-builder'
import { buildPatientUpdatePayload } from '@/lib/patients/lib/zod/patients'
import { buildProfileUpdatePayload } from '@/lib/patients/lib/zod/profiles'
import { createAdminClient } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import type { Database } from '@autamedica/types'
import { jsonOk, unauthorized, badRequest, internalError } from '@/lib/api-helpers'

type ProfileUpdate = Database['public']['Tables']['profiles']['Update']
type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
type PatientUpdate = Database['public']['Tables']['patients']['Update']
type PatientInsert = Database['public']['Tables']['patients']['Insert']

export const PATCH: APIRoute = async ({ request }) => {
  try {
    const userId = await getUserIdFromRequest(request)
    if (!userId) return unauthorized()

    const body = await request.json().catch(() => ({}))
    const { profile, patient } = body ?? {}

    const admin = createAdminClient()

    let updatedProfile: unknown = null
    let updatedPatient: unknown = null

    // Update profiles
    if (profile) {
      const snake = buildProfileUpdatePayload(profile)
      try {
        const upd = await admin
          .from('profiles')
          .update(snake as unknown as ProfileUpdate)
          .eq('user_id', userId)
          .select('*')
          .maybeSingle()

        if (upd.error && upd.error.code !== 'PGRST116') {
          throw upd.error
        }

        if (upd.data) {
          updatedProfile = upd.data
        } else {
          const ins = await admin
            .from('profiles')
            .insert({
              user_id: userId,
              external_id: userId,
              role: 'patient',
              ...snake,
            } as unknown as ProfileInsert)
            .select('*')
            .single()

          if (ins.error) {
            throw ins.error
          }

          updatedProfile = ins.data
        }
      } catch (profileError: unknown) {
        const msg = profileError instanceof Error ? profileError.message : 'profile_update_failed'
        logger.error('[API] profile update failed', profileError as Error)
        return badRequest(msg)
      }
    }

    // Update patients (optional)
    if (patient) {
      const snake = buildPatientUpdatePayload(patient)
      try {
        const upd = await admin
          .from('patients')
          .update(snake as unknown as PatientUpdate)
          .eq('user_id', userId)
          .select('*')
          .maybeSingle()

        if (upd.error) throw upd.error

        if (!upd.data) {
          const ins = await admin
            .from('patients')
            .upsert(
              { user_id: userId, ...snake } as unknown as PatientInsert,
              { onConflict: 'user_id' },
            )
            .select('*')
            .maybeSingle()

          if (ins.error) throw ins.error
          updatedPatient = ins.data
        } else {
          updatedPatient = upd.data
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.warn('[API] patients update skipped:', msg)
      }
    }

    // Fire-and-forget: resync context and personalized files
    try {
      const ctx = await buildPatientContext(userId, admin)
      await persistPatientContextFiles(userId, ctx, admin)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      logger.warn('[API] context resync after profile update failed:', msg)
    }

    return jsonOk({ profile: updatedProfile, patient: updatedPatient })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'internal_error'
    logger.error('[API] profile PATCH error', e as Error)
    return internalError(msg)
  }
}
