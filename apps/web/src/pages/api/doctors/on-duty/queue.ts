import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth'
import { internalError, jsonOk } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals)
  if (!isAuthed(auth)) return auth

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const { data, error } = await admin
      .from('pharmacy_dispatch_requests')
      .select('id, pharmacy_id, patient_dni, patient_name, patient_phone, tier_requested, symptom_summary, status, created_at, cloudflare_room_id')
      .eq('status', 'searching')
      .order('created_at', { ascending: true })

    if (error) {
      logger.error('[api/doctors/on-duty/queue] DB error', error)
      return internalError('Error al obtener cola de solicitudes en farmacia')
    }

    const now = Date.now()
    const queue = (data || []).map((row) => {
      const createdTime = new Date(row.created_at).getTime()
      const diffMs = Math.max(0, now - createdTime)
      return {
        id: String(row.id),
        pharmacyId: row.pharmacy_id ? String(row.pharmacy_id) : null,
        pharmacyName: 'Farmacia / Kiosco On-Demand',
        patientDni: String(row.patient_dni),
        patientName: String(row.patient_name || 'Paciente Kiosco'),
        patientPhone: String(row.patient_phone),
        reason: String(row.symptom_summary || `Consulta ${row.tier_requested || 'General'}`),
        status: row.status,
        createdAt: String(row.created_at),
        minutesWaiting: Math.floor(diffMs / 60000),
      }
    })

    return jsonOk({
      queue,
      count: queue.length,
    })
  } catch (err) {
    logger.error('[api/doctors/on-duty/queue] GET error', err)
    return internalError('Error al obtener cola de solicitudes en farmacia')
  }
}
