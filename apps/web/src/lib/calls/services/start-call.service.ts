import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import type { CallStatus } from '@autamedica/telemedicine'
import { resolveDoctorId, doctorHasPatientAccess } from '@/lib/doctors/lib/resolve-room'
import { callStartRepo } from '@/lib/calls/repos/call-start.repo'

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

async function ensureRinging(supabase: Db, callId: string, currentStatus: CallStatus): Promise<CallStatus> {
  if (currentStatus !== 'requested') {
    return currentStatus
  }

  const updated = await callStartRepo.updateCallStatus(supabase, callId, 'ringing')
  if (!updated) {
    throw new Error('Unable to update call status to ringing')
  }

  return 'ringing'
}

async function cancelSupersededPendingCalls(
  supabase: Db,
  doctorId: string,
  patientId: string,
  appointmentId?: string,
): Promise<void> {
  const pendingCalls = await callStartRepo.listPendingByParticipants(supabase, doctorId, patientId)

  for (const call of pendingCalls) {
    if (appointmentId && call.appointment_id === appointmentId) {
      continue
    }

    await callStartRepo.updateCallStatus(
      supabase,
      call.id,
      'canceled',
      'superseded_by_new_call'
    )
  }
}

export const startCallService = {
  async startCall(
    admin: Db,
    actorSupabase: Db,
    input: StartCallRequest,
  ): Promise<StartCallOutcome> {
    const doctorId = await resolveDoctorId(admin, input.doctorUserId)
    if (!doctorId) {
      return { kind: 'forbidden', message: 'doctor_not_found' }
    }

    const patient = await callStartRepo.findPatientById(admin, input.patientId)
    if (!patient) {
      return { kind: 'not_found', message: 'patient_not_found' }
    }

    if (input.appointmentId) {
      const appointment = await callStartRepo.findAppointmentById(admin, input.appointmentId)
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

      const existingCall = await callStartRepo.findActiveByAppointmentId(admin, input.appointmentId)
      if (existingCall) {
        const status = await ensureRinging(actorSupabase, existingCall.id, existingCall.status)
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

      await cancelSupersededPendingCalls(actorSupabase, doctorId, input.patientId, input.appointmentId)
    } else {
      const hasAccess = await doctorHasPatientAccess(admin, doctorId, input.patientId)
      if (!hasAccess) {
        return { kind: 'forbidden', message: 'patient_access_denied' }
      }

      const existingCall = await callStartRepo.findActiveByParticipants(admin, doctorId, input.patientId)
      if (existingCall) {
        const status = await ensureRinging(actorSupabase, existingCall.id, existingCall.status)
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

    const call = await callStartRepo.createCall(actorSupabase, doctorId, input.patientId, input.appointmentId)
    const status = await ensureRinging(actorSupabase, call.id, call.status)

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
  },
}
