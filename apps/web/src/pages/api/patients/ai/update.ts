/**
 * POST /api/patients/ai/update
 *
 * Actualiza datos de perfil y/o paciente desde el chat de IA.
 * Mapea camelCase del frontend a snake_case de la DB.
 * Despues de actualizar, reconstruye y persiste el contexto del paciente.
 */

import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { createAdminClient } from '@autamedica/auth/server'
import { getUserIdFromRequest } from '@/lib/patients/api/auth'
import {
  buildPatientContext,
  persistPatientContextFiles,
} from '@/lib/patients/lib/ai/context-builder'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

interface ProfileUpdate {
  firstName?: string
  lastName?: string
  phone?: string
  email?: string
}

interface PatientUpdate {
  heightCm?: number
  weightKg?: number
  bloodType?: string
  gender?: string
  birthDate?: string
}

function buildProfilePayload(input: ProfileUpdate): Record<string, unknown> | null {
  const payload: Record<string, unknown> = {}

  if (typeof input.firstName === 'string') payload.first_name = input.firstName
  if (typeof input.lastName === 'string') payload.last_name = input.lastName
  if (typeof input.phone === 'string') payload.phone = input.phone
  if (typeof input.email === 'string') payload.email = input.email

  return Object.keys(payload).length > 0 ? payload : null
}

function buildPatientPayload(input: PatientUpdate): Record<string, unknown> | null {
  const payload: Record<string, unknown> = {}

  if (typeof input.heightCm === 'number') payload.height_cm = input.heightCm
  if (typeof input.weightKg === 'number') payload.weight_kg = input.weightKg
  if (typeof input.bloodType === 'string') payload.blood_type = input.bloodType
  if (typeof input.gender === 'string') payload.gender = input.gender
  if (typeof input.birthDate === 'string') payload.birth_date = input.birthDate

  return Object.keys(payload).length > 0 ? payload : null
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const userId = await getUserIdFromRequest(request)

    if (!userId) {
      return json({ ok: false, error: 'unauthorized' }, 401)
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const profileInput = (body.profile ?? {}) as ProfileUpdate
    const patientInput = (body.patient ?? {}) as PatientUpdate

    const profilePayload = buildProfilePayload(profileInput)
    const patientPayload = buildPatientPayload(patientInput)

    if (!profilePayload && !patientPayload) {
      return json({ ok: false, error: 'no_updates_provided' }, 400)
    }

    const admin = createAdminClient()

    if (profilePayload) {
      const { error } = await admin
        .from('profiles')
        .update(profilePayload as never)
        .eq('id', userId)

      if (error) {
        logger.error('[API] patients/ai/update profile update failed', error)
        return json({ ok: false, error: 'profile_update_failed' }, 500)
      }
    }

    if (patientPayload) {
      const { error } = await admin
        .from('patients')
        .upsert(
          { user_id: userId, ...patientPayload } as never,
          { onConflict: 'user_id' },
        )

      if (error) {
        logger.error('[API] patients/ai/update patient upsert failed', error)
        return json({ ok: false, error: 'patient_update_failed' }, 500)
      }
    }

    const ctx = await buildPatientContext(userId, admin as never)
    const storage = await persistPatientContextFiles(userId, ctx, admin as never)

    return json({
      ok: true,
      data: {
        summary: ctx.summary,
        storage,
      },
    })
  } catch (err) {
    logger.error('[API] patients/ai/update error', err as Error)
    return json({ ok: false, error: 'internal_error' }, 500)
  }
}
