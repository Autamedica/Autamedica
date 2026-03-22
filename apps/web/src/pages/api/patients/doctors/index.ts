import type { APIRoute } from 'astro'
import { createAdminClient } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

interface DoctorRow {
  id: string
  specialty: string | null
  profile: {
    first_name: string | null
    last_name: string | null
  } | null
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const context = await resolvePatientContext(request)
    if (!context) {
      return json({ success: false, error: 'Unauthorized' }, 401)
    }

    const admin = createAdminClient()

    const { data, error } = await admin
      .from('doctors')
      .select('id, specialty, profile:profiles!doctors_user_id_fkey(first_name, last_name)')
      .eq('active', true)

    if (error) {
      logger.error('[doctors/GET] Query failed', error)
      return json({ success: false, error: 'Failed to fetch doctors' }, 500)
    }

    const doctors = ((data ?? []) as unknown as DoctorRow[]).map((row) => {
      const firstName = row.profile?.first_name ?? ''
      const lastName = row.profile?.last_name ?? ''
      const fullName = [firstName, lastName].filter(Boolean).join(' ')

      return {
        id: row.id,
        specialty: row.specialty,
        first_name: row.profile?.first_name ?? null,
        last_name: row.profile?.last_name ?? null,
        label: fullName ? `Dr. ${fullName}` : 'Profesional disponible',
      }
    })

    doctors.sort((a, b) => a.label.localeCompare(b.label, 'es'))

    return json({ success: true, data: doctors })
  } catch (err) {
    logger.error('[doctors/GET] Unexpected error', err)
    return json({ success: false, error: 'Internal server error' }, 500)
  }
}
