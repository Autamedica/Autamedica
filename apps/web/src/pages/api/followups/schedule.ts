import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { withAuthOrApiKey } from '@/lib/api-auth'
import { badRequest, internalError, jsonOk } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { followupScheduleService, type ScheduleFollowupInput } from '@/lib/calls/services/followup-schedule.service'

export const prerender = false

export const POST: APIRoute = async ({ request, locals }) => {
  const authResult = await withAuthOrApiKey(request, ['doctor', 'admin', 'organization_admin'], locals)
  if (authResult instanceof Response) {
    return authResult
  }

  const body = (await request.json().catch(() => ({}))) as ScheduleFollowupInput

  if (!body.callId && !body.appointmentId && (!body.patientId || !body.doctorId)) {
    return badRequest('call_id_or_appointment_id_required')
  }

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const result = await followupScheduleService.schedule48hFollowup(admin, body)

    if (!result.ok) {
      return badRequest(result.error || 'followup_scheduling_failed')
    }

    return jsonOk(result)
  } catch (error) {
    logger.error('[api/followups/schedule] POST error', error)
    return internalError()
  }
}
