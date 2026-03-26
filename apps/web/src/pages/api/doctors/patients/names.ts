import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { badRequest, forbidden, internalError, jsonOk } from '@/lib/api-helpers'
import { withAuth, isAuthed } from '@/lib/api-auth'
import { createAstroAdminClient } from '@/lib/supabase'

interface PatientNameRow {
  id: string
  profile: {
    first_name: string | null
    last_name: string | null
  } | null
}

interface NamesRequestBody {
  patientIds?: string[]
}

export const POST: APIRoute = async ({ request }) => {
  const auth = await withAuth(request)
  if (!isAuthed(auth)) return auth

  const role = auth.user.user_metadata?.role ?? auth.user.app_metadata?.role
  if (role !== 'doctor') {
    return forbidden('doctor_only')
  }

  try {
    const body = (await request.json()) as NamesRequestBody
    const patientIds = Array.from(
      new Set((body.patientIds ?? []).map((value) => value.trim()).filter(Boolean)),
    )

    if (patientIds.length === 0) {
      return jsonOk<Record<string, string>>({})
    }

    if (patientIds.length > 100) {
      return badRequest('too_many_patient_ids')
    }

    const admin = createAstroAdminClient()
    const { data, error } = await admin
      .from('patients')
      .select(`
        id,
        profile:profiles!inner(
          first_name,
          last_name
        )
      `)
      .in('id', patientIds)

    if (error) {
      logger.error('[api/doctors/patients/names] query failed', error)
      return internalError()
    }

    const nameMap = ((data ?? []) as PatientNameRow[]).reduce<Record<string, string>>((acc, row) => {
      const fullName = [row.profile?.first_name, row.profile?.last_name]
        .filter(Boolean)
        .join(' ')
        .trim()

      acc[row.id] = fullName || 'Paciente'
      return acc
    }, {})

    return jsonOk(nameMap)
  } catch (error) {
    logger.error('[api/doctors/patients/names] POST error', error)
    return internalError()
  }
}
