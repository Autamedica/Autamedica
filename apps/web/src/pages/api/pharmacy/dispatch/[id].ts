import type { APIRoute } from 'astro'
import { internalError, jsonOk, notFound } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'

/**
 * GET /api/pharmacy/dispatch/[id]
 *
 * Devuelve una solicitud on-demand con la identidad real del médico asignado
 * (nombre completo desde profiles + matrícula/especialidad desde doctors).
 * Se resuelve con admin client porque `profiles` no es legible por anon.
 */
export const GET: APIRoute = async ({ params, locals }) => {
  const id = params.id?.trim()
  if (!id) return notFound('missing_request_id')

  try {
    const supabase = createAstroAdminClient(locals.runtime?.env)

    const { data: request, error } = await supabase
      .from('pharmacy_dispatch_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error || !request) {
      logger.warn('[api/pharmacy/dispatch/[id]] Request not found', { id })
      return notFound('request_not_found')
    }

    let doctor: { full_name: string; license_number: string; specialty: string } | null = null

    if (request.assigned_doctor_id) {
      const { data: doctorRow } = await supabase
        .from('doctors')
        .select('id, user_id, license_number, specialty')
        .eq('id', request.assigned_doctor_id)
        .maybeSingle()

      if (doctorRow) {
        let fullName = ''
        if (doctorRow.user_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('user_id', doctorRow.user_id)
            .maybeSingle()
          fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim()
        }
        doctor = {
          full_name: fullName || 'Médico AutaMedica',
          license_number: doctorRow.license_number,
          specialty: doctorRow.specialty,
        }
      }
    }

    return jsonOk({ request, doctor })
  } catch (err) {
    logger.error('[api/pharmacy/dispatch/[id]] Exception', { err })
    return internalError()
  }
}