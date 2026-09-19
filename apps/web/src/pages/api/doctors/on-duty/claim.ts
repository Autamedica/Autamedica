import type { APIRoute } from 'astro'
import { logger, BASE_URL_BY_ROLE } from '@autamedica/shared'
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth'
import { badRequest, conflict, forbidden, internalError, jsonOk, notFound } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { pharmacyOnDemandService } from '@/lib/pharmacy/services/pharmacy-on-demand.service'
import { ClaimPharmacyRequestSchema } from '@/lib/pharmacy/types'

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals)
  if (!isAuthed(auth)) return auth

  try {
    const body = (await request.json().catch(() => null)) as unknown
    const parsed = ClaimPharmacyRequestSchema.safeParse(body)

    if (!parsed.success) {
      return badRequest('ID de solicitud requerido (UUID)')
    }

    const admin = createAstroAdminClient(locals.runtime?.env)
    const siteUrl = (locals.runtime?.env?.PUBLIC_SITE_URL as string) || BASE_URL_BY_ROLE['patient']
    const origin = siteUrl ? new URL(siteUrl).origin : new URL(request.url).origin

    const result = await pharmacyOnDemandService.claimRequest(
      admin,
      auth.user.id,
      parsed.data.requestId,
      origin,
    )

    return jsonOk(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('[api/doctors/on-duty/claim] POST error', { message, err })

    if (message === 'doctor_not_found') return forbidden('Perfil médico no encontrado')
    if (message === 'request_not_found') return notFound('Solicitud no encontrada')
    if (message === 'request_already_claimed_or_closed') {
      return conflict('La solicitud ya fue tomada por otro médico o fue cancelada')
    }

    return internalError('Error al tomar la consulta médica')
  }
}
