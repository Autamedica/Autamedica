import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { withAuthOrApiKey } from '@/lib/api-auth'
import { badRequest, forbidden, internalError, jsonOk, notFound } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { followupScheduleService } from '@/lib/calls/services/followup-schedule.service'

export const prerender = false

export const POST: APIRoute = async ({ request, params, locals }) => {
  const callId = params.callId?.trim()
  if (!callId) {
    return badRequest('call_id_required')
  }

  const authResult = await withAuthOrApiKey(request, ['doctor', 'admin', 'organization_admin'], locals)
  if (authResult instanceof Response) {
    return authResult
  }

  const admin = createAstroAdminClient(locals.runtime?.env)

  // Validar pertenencia si es sesión médica
  if ('user' in authResult) {
    const { data: callData } = await admin
      .from('calls')
      .select('id, doctor_id, patient_id, doctor:doctors!inner(user_id)')
      .eq('id', callId)
      .maybeSingle()

    const callDoctor = (callData as { doctor?: { user_id?: string } } | null)?.doctor
    if (callDoctor && callDoctor.user_id !== authResult.user.id) {
      return forbidden('not_call_participant')
    }
  }

  const body = (await request.json().catch(() => ({}))) as {
    delayHours?: number
    immediate?: boolean
    dryRun?: boolean
    lang?: 'es' | 'pt-br'
  }

  try {
    const result = await followupScheduleService.schedule48hFollowup(admin, {
      callId,
      ...body,
    })

    if (!result.ok) {
      return badRequest(result.error || 'scheduling_failed')
    }

    return jsonOk(result)
  } catch (error) {
    logger.error('[api/calls/[callId]/followup] POST error', error)
    return internalError()
  }
}

export const GET: APIRoute = async ({ request, params, locals }) => {
  const callId = params.callId?.trim()
  if (!callId) return badRequest('call_id_required')

  const authResult = await withAuthOrApiKey(request, ['doctor', 'admin', 'organization_admin', 'patient'], locals)
  if (authResult instanceof Response) {
    return authResult
  }

  const admin = createAstroAdminClient(locals.runtime?.env)

  // Validar pertenencia a la llamada para mitigar BOLA/IDOR
  if ('user' in authResult) {
    const { data: callData } = await admin
      .from('calls')
      .select('id, doctor_id, patient_id, doctor:doctors(user_id), patient:patients(user_id)')
      .eq('id', callId)
      .maybeSingle()

    const call = callData as {
      doctor?: { user_id?: string } | null
      patient?: { user_id?: string } | null
    } | null

    const isParticipant =
      call?.doctor?.user_id === authResult.user.id ||
      call?.patient?.user_id === authResult.user.id

    if (!isParticipant) {
      return forbidden('not_call_participant')
    }
  }

  try {
    const { data, error } = await (admin as unknown as {
      from: (tbl: string) => {
        select: (cols: string) => {
          eq: (col: string, val: unknown) => {
            order: (col: string, opts: { ascending: boolean }) => {
              limit: (n: number) => {
                maybeSingle: () => Promise<{ data: unknown; error: unknown }>
              }
            }
          }
        }
      }
    })
      .from('appointment_followups')
      .select('*')
      .eq('call_id', callId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      logger.error('[api/calls/[callId]/followup] GET error', error)
      return internalError()
    }

    if (!data) {
      return notFound('no_followup_found_for_call')
    }

    return jsonOk(data)
  } catch (error) {
    logger.error('[api/calls/[callId]/followup] GET exception', error)
    return internalError()
  }
}
