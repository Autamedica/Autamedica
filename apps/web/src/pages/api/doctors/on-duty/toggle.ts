import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth'
import { badRequest, internalError, jsonOk, notFound } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { pharmacyOnDemandService } from '@/lib/pharmacy/services/pharmacy-on-demand.service'
import { ToggleDoctorOnDutySchema } from '@/lib/pharmacy/types'

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals)
  if (!isAuthed(auth)) return auth

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const status = await pharmacyOnDemandService.getDoctorOnDutyStatus(admin, auth.user.id)

    if (!status) {
      return notFound('Perfil médico no encontrado')
    }

    return jsonOk(status)
  } catch (err) {
    logger.error('[api/doctors/on-duty/toggle] GET error', err)
    return internalError('Error al consultar estado de guardia')
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals)
  if (!isAuthed(auth)) return auth

  try {
    const body = (await request.json().catch(() => null)) as unknown
    const parsed = ToggleDoctorOnDutySchema.safeParse(body)

    if (!parsed.success) {
      return badRequest('Parámetro onDuty requerido (booleano)')
    }

    const admin = createAstroAdminClient(locals.runtime?.env)
    const updatedStatus = await pharmacyOnDemandService.toggleDoctorOnDuty(
      admin,
      auth.user.id,
      parsed.data.onDuty,
    )

    return jsonOk(updatedStatus)
  } catch (err) {
    logger.error('[api/doctors/on-duty/toggle] POST error', err)
    return internalError('Error al alternar estado de guardia médica')
  }
}
