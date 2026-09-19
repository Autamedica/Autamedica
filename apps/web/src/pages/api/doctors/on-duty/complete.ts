import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth'
import { badRequest, forbidden, internalError, jsonOk, notFound } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { pharmacyOnDemandService } from '@/lib/pharmacy/services/pharmacy-on-demand.service'
import { CompletePharmacyConsultationSchema } from '@/lib/pharmacy/types'

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals)
  if (!isAuthed(auth)) return auth

  try {
    const body = (await request.json().catch(() => null)) as unknown
    const parsed = CompletePharmacyConsultationSchema.safeParse(body)

    if (!parsed.success) {
      return badRequest('ID de solicitud requerido (UUID)')
    }

    const admin = createAstroAdminClient(locals.runtime?.env)
    const result = await pharmacyOnDemandService.completeRequest(
      admin,
      auth.user.id,
      parsed.data.requestId,
    )

    return jsonOk(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('[api/doctors/on-duty/complete] POST error', { message, err })

    if (message === 'doctor_not_found' || message === 'unauthorized_doctor') {
      return forbidden('No autorizado para completar esta consulta')
    }
    if (message === 'request_not_found') {
      return notFound('Solicitud no encontrada')
    }

    return internalError('Error al completar la consulta médica')
  }
}
