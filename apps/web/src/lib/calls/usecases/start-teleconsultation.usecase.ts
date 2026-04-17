import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger, domainEvents } from '@autamedica/shared'
import type { CallStatus } from '@autamedica/telemedicine'
import type { ICallStartRepository } from '@/lib/calls/ports/call-start.port'
import { resolveDoctorId, doctorHasPatientAccess } from '@/lib/doctors/lib/resolve-room'
import { isTelemedicineCallWindowOpen } from '@/lib/calls/lib/telemedicine-window'
import { appointmentBackendService } from '@/lib/doctors/services/appointment.backend'
import { canDoctorStartVideoconsulta } from '@/lib/calls/lib/doctor-videoconsulta-credits'

type Db = SupabaseClient<Database>

const CALLABLE_APPOINTMENT_STATUSES = new Set(['scheduled', 'confirmed', 'in_progress'])

export interface StartCallRequest {
  doctorUserId: string
  patientId: string
  appointmentId?: string
}

export interface StartCallResponse {
  callId: string
  roomId: string
  status: CallStatus
  appointmentId: string | null
  reused: boolean
}

type StartCallOutcome =
  | { kind: 'ok'; data: StartCallResponse }
  | { kind: 'not_found'; message: string }
  | { kind: 'forbidden'; message: string }
  | { kind: 'conflict'; message: string }

export interface StartTeleconsultationDeps {
  adminCallRepo: ICallStartRepository
  actorCallRepo: ICallStartRepository
  adminDb: Db // Para dependencias legacy de resolución
}

async function ensureRinging(repo: ICallStartRepository, callId: string, currentStatus: CallStatus): Promise<CallStatus> {
  if (currentStatus !== 'requested') {
    return currentStatus
  }

  const updated = await repo.updateCallStatus(callId, 'ringing')
  if (!updated) {
    throw new Error('Unable to update call status to ringing')
  }

  return 'ringing'
}

async function cancelSupersededPendingCalls(
  repo: ICallStartRepository,
  doctorId: string,
  patientId: string,
  appointmentId?: string,
): Promise<void> {
  const pendingCalls = await repo.listPendingByParticipants(doctorId, patientId)

  const toCancel = pendingCalls.filter(
    (call) => !(appointmentId && call.appointment_id === appointmentId),
  )

  await repo.cancelCallsBatch(
    toCancel.map(c => ({ id: c.id, status: c.status })),
    'superseded_by_new_call',
  )
}

export async function startTeleconsultationUseCase(
  deps: StartTeleconsultationDeps,
  input: StartCallRequest,
): Promise<StartCallOutcome> {
  const { adminCallRepo, actorCallRepo, adminDb } = deps

  const doctorId = await resolveDoctorId(adminDb, input.doctorUserId)
  if (!doctorId) {
    return { kind: 'forbidden', message: 'doctor_not_found' }
  }

  const patient = await adminCallRepo.findPatientById(input.patientId)
  if (!patient) {
    return { kind: 'not_found', message: 'patient_not_found' }
  }

  if (input.appointmentId) {
    const appointment = await adminCallRepo.findAppointmentById(input.appointmentId)
    if (!appointment) {
      return { kind: 'not_found', message: 'appointment_not_found' }
    }

    if (appointment.doctor_id !== doctorId) {
      return { kind: 'forbidden', message: 'appointment_access_denied' }
    }

    if (appointment.patient_id !== input.patientId) {
      return { kind: 'conflict', message: 'appointment_patient_mismatch' }
    }

    if (appointment.type !== 'telemedicine') {
      return { kind: 'conflict', message: 'appointment_not_telemedicine' }
    }

    if (!CALLABLE_APPOINTMENT_STATUSES.has(appointment.status)) {
      return { kind: 'conflict', message: 'appointment_not_callable' }
    }

    if (!isTelemedicineCallWindowOpen(appointment)) {
      return { kind: 'conflict', message: 'appointment_outside_call_window' }
    }

    const existingCall = await adminCallRepo.findActiveByAppointmentId(input.appointmentId)
    if (existingCall) {
      const status = await ensureRinging(actorCallRepo, existingCall.id, existingCall.status)
      return {
        kind: 'ok',
        data: {
          callId: existingCall.id,
          roomId: existingCall.room_id,
          status,
          appointmentId: existingCall.appointment_id ?? input.appointmentId,
          reused: true,
        },
      }
    }

    await cancelSupersededPendingCalls(actorCallRepo, doctorId, input.patientId, input.appointmentId)
  } else {
    const hasAccess = await doctorHasPatientAccess(adminDb, doctorId, input.patientId)
    if (!hasAccess) {
      return { kind: 'forbidden', message: 'patient_access_denied' }
    }

    const existingCall = await adminCallRepo.findActiveByParticipants(doctorId, input.patientId)
    if (existingCall) {
      const status = await ensureRinging(actorCallRepo, existingCall.id, existingCall.status)
      return {
        kind: 'ok',
        data: {
          callId: existingCall.id,
          roomId: existingCall.room_id,
          status,
          appointmentId: existingCall.appointment_id ?? null,
          reused: true,
        },
      }
    }
  }

    // Check videoconsulta credits (free or subscription-based)
    const creditCheck = await canDoctorStartVideoconsulta(adminDb, doctorId)
    if (!creditCheck.allowed) {
      return { kind: 'forbidden', message: creditCheck.reason ?? 'no_videoconsulta_credits' }
    }

    const call = await actorCallRepo.createCall(doctorId, input.patientId, input.appointmentId)
    const status = await ensureRinging(actorCallRepo, call.id, call.status)

    // Transition appointment to in_progress if applicable
    if (input.appointmentId) {
      try {
        await appointmentBackendService.transitionStatus(input.appointmentId, 'in_progress');
      } catch (err) {
        logger.warn('[startTeleconsultation] Appointment transition to in_progress failed', {
          appointmentId: input.appointmentId,
          error: err,
        });
      }
    }

    // Emit domain event once, as close to the fact as possible.
    // Wrapped so a handler failure never breaks the call start flow.
    try {
      await domainEvents.emit('call.started', {
        callId: call.id,
        roomId: call.room_id,
        doctorId,
        patientId: input.patientId,
      })
    } catch (err) {
      logger.warn('[startTeleconsultation] call.started emit failed', {
        callId: call.id,
        error: err instanceof Error ? err.message : err,
      })
    }

    return {
      kind: 'ok',
      data: {
        callId: call.id,
        roomId: call.room_id,
        status,
        appointmentId: call.appointment_id ?? input.appointmentId ?? null,
        reused: false,
      },
    }
}
