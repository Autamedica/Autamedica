import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient, createAstroServerClientFromRequest } from '@/lib/supabase'
import { appointmentsService } from '@/lib/patients/services/appointments.service'
import { callStartRepo } from '@/lib/calls/repos/call-start.repo'
import { isTelemedicineCallWindowOpen } from '@/lib/calls/lib/telemedicine-window'
import { badRequest, conflict, internalError, jsonOk, notFound, unauthorized } from '@/lib/api-helpers'

const JOINABLE_STATUSES = new Set(['scheduled', 'confirmed', 'in_progress', 'in-progress'])

async function ensurePatientJoined(
  actorSupabase: ReturnType<typeof createAstroServerClientFromRequest>,
  callId: string,
  currentStatus: string,
): Promise<string> {
  if (currentStatus !== 'requested' && currentStatus !== 'ringing') {
    return currentStatus
  }

  try {
    const updated = await callStartRepo.updateCallStatus(actorSupabase, callId, 'accepted')
    return updated ? 'accepted' : currentStatus
  } catch (error) {
    logger.warn('[patients/appointments/[id]/join] Failed to move call to accepted', error)
    return currentStatus
  }
}

function isCallAlignedWithAppointmentWindow(
  call: { created_at: string },
  appointment: {
    start_time?: string | null
    scheduled_at?: string | null
    end_time?: string | null
    duration_minutes?: number | null
  },
): boolean {
  const callCreatedAtMs = Date.parse(call.created_at)
  if (Number.isNaN(callCreatedAtMs)) {
    return false
  }

  return isTelemedicineCallWindowOpen(appointment, callCreatedAtMs)
}

export const POST: APIRoute = async ({ request, params, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()
  if (!params.id?.trim()) return badRequest('appointment_id_required')

  try {
    const admin = createAstroAdminClient()
    const actorSupabase = createAstroServerClientFromRequest(request)
    const appointment = await appointmentsService.getById(admin, params.id, context.patientId)

    if (!appointment) {
      return notFound('appointment_not_found')
    }

    if (!appointment.doctor_id) {
      return conflict('appointment_doctor_missing')
    }

    const isTelemedicine = appointment.type === 'telemedicine' || Boolean(appointment.meeting_url)
    if (!isTelemedicine) {
      return conflict('appointment_not_telemedicine')
    }

    if (!JOINABLE_STATUSES.has(appointment.status)) {
      return conflict('appointment_not_joinable')
    }

    if (!isTelemedicineCallWindowOpen(appointment)) {
      return conflict('appointment_outside_call_window')
    }

    const appointmentScopedCall = await callStartRepo.findActiveByAppointmentId(admin, appointment.id)
    const participantCall = appointmentScopedCall
      ? null
      : await callStartRepo.findActiveByParticipants(
        admin,
        appointment.doctor_id,
        context.patientId,
      )

    const existingCall = appointmentScopedCall
      ?? (participantCall && isCallAlignedWithAppointmentWindow(participantCall, appointment)
        ? participantCall
        : null)

    if (existingCall) {
      const status = await ensurePatientJoined(actorSupabase, existingCall.id, existingCall.status)
      return jsonOk({
        callId: existingCall.id,
        roomId: existingCall.room_id,
        status,
        reused: true,
      })
    }

    const createdCall = await callStartRepo.createCall(
      admin,
      appointment.doctor_id,
      context.patientId,
      appointment.id,
    )
    const status = await ensurePatientJoined(actorSupabase, createdCall.id, createdCall.status)

    return jsonOk({
      callId: createdCall.id,
      roomId: createdCall.room_id,
      status,
      reused: false,
    })
  } catch (error) {
    logger.error('[patients/appointments/[id]/join] POST error', error)
    return internalError()
  }
}
