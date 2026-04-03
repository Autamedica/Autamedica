import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { badRequest, forbidden, internalError, jsonOk } from '@/lib/api-helpers'
import { withAuth, isAuthed } from '@/lib/api-auth'
import { createAstroAdminClient } from '@/lib/supabase'

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
        profile:profiles(
          first_name,
          last_name,
          email
        )
      `)
      .in('id', patientIds)

    if (error) {
      logger.error('[api/doctors/patients/names] query failed', error)
      return internalError()
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nameMap = ((data ?? []) as any[]).reduce<Record<string, string>>((acc, row) => {
      const first = row.profile?.first_name?.trim()
      const last = row.profile?.last_name?.trim()
      const fullName = [first, last].filter(Boolean).join(' ').trim()

      if (fullName) {
        acc[row.id] = fullName
      } else if (row.profile?.email) {
        const email = row.profile.email
        const [user, domain] = email.split('@')
        const masked = !domain || user.length <= 2 
          ? '***@' + (domain || 'unknown') 
          : `${user.slice(0, 2)}***${user.slice(-2)}@${domain}`
        acc[row.id] = masked
      } else {
        acc[row.id] = 'Paciente'
      }
      return acc
    }, {})

    return jsonOk(nameMap)
  } catch (error) {
    logger.error('[api/doctors/patients/names] POST error', error)
    return internalError()
  }
}
