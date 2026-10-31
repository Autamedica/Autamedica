import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient, createAstroServerClientFromRequest } from '@/lib/supabase'
import { appointmentsUseCase } from '@/lib/patients/usecases/appointments.usecase'
import { createAppointmentAdapter } from '@/lib/patients/lib/repos/appointments.adapter'
import { createCallStartAdapter } from '@/lib/calls/repos/call-start.adapter'
import { isTelemedicineCallWindowOpen } from '@/lib/calls/lib/telemedicine-window'
import { appointmentPaymentsService } from '@/lib/payments/services/appointment-payments.service'
import { isDoctorScheduledAppointment } from '@/lib/calls/lib/appointment-payment-origin'
import { badRequest, conflict, internalError, jsonOk, notFound, unauthorized } from '@/lib/api-helpers'

const JOINABLE_STATUSES = new Set(['scheduled', 'confirmed', 'in_progress'])

async function ensurePatientJoined(
  actorSupabase: ReturnType<typeof createAstroServerClientFromRequest>,
  callId: string,
  currentStatus: string,
): Promise<string> {
  if (currentStatus !== 'requested' && currentStatus !== 'ringing') {
    return currentStatus
  }

  try {
    const updated = await createCallStartAdapter(actorSupabase).updateCallStatus(callId, 'accepted')
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
    const admin = createAstroAdminClient(locals.runtime?.env)
    const actorSupabase = createAstroServerClientFromRequest(request)
    const appointment = await appointmentsUseCase.getById({ appointmentsRepo: createAppointmentAdapter(admin), dbClient: admin }, params.id, context.patientId)

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

    const appointmentScopedCall = await createCallStartAdapter(admin).findActiveByAppointmentId(appointment.id)
    const participantCall = appointmentScopedCall
      ? null
      : await createCallStartAdapter(admin).findActiveByParticipants(
        appointment.doctor_id,
        context.patientId,
      )

    const existingCall = appointmentScopedCall
      ?? (participantCall && isCallAlignedWithAppointmentWindow(participantCall, appointment)
        ? participantCall
        : null)

    // Booking provenance must match the assigned doctor's verified user ID.
    // Merely being different from the patient's ID is not proof of creation by
    // a physician; direct clients previously had UPDATE on created_by.
    let wasCreatedByDoctor = false
    if (!existingCall && appointment.created_by) {
      const { data: assignedDoctor, error: assignedDoctorError } = await admin
        .from('doctors')
        .select('user_id')
        .eq('id', appointment.doctor_id)
        .maybeSingle()
      if (assignedDoctorError) throw assignedDoctorError
      wasCreatedByDoctor = isDoctorScheduledAppointment(
        appointment.created_by,
        assignedDoctor?.user_id,
      )
    }

    if (!existingCall && !wasCreatedByDoctor) {
      const hasApprovedPayment = await appointmentPaymentsService.hasApprovedPayment(admin, appointment.id)
      if (!hasApprovedPayment) {
        return conflict('appointment_payment_required')
      }
    }

    if (existingCall) {
      const status = await ensurePatientJoined(actorSupabase, existingCall.id, existingCall.status)
      return jsonOk({
        callId: existingCall.id,
        roomId: existingCall.room_id,
        status,
        reused: true,
      })
    }

    const createdCall = await createCallStartAdapter(admin).createCall(
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
