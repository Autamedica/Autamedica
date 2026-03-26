import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { callResponseRepo } from '@/lib/calls/repos/call-response.repo'
import {
  resolveDoctorCancelStatus,
  type DoctorCancelReason,
} from '@/lib/calls/services/call-status-rules'
import { resolveDoctorId } from '@/lib/doctors/lib/resolve-room'

type Db = SupabaseClient<Database>

export interface CancelCallRequest {
  doctorUserId: string
  callId: string
  reason: DoctorCancelReason
}

export interface CancelCallResponse {
  callId: string
  roomId: string
  status: 'canceled'
  changed: boolean
  reason: DoctorCancelReason
}

type CancelCallOutcome =
  | { kind: 'ok'; data: CancelCallResponse }
  | { kind: 'not_found'; message: string }
  | { kind: 'forbidden'; message: string }
  | { kind: 'conflict'; message: string }

function matchesDoctor(
  doctorProfileId: string | null,
  callDoctorId: string,
  doctorUserId: string,
): boolean {
  return callDoctorId === doctorUserId || (doctorProfileId !== null && callDoctorId === doctorProfileId)
}

export const cancelCallService = {
  async cancel(
    admin: Db,
    actorSupabase: Db,
    input: CancelCallRequest,
  ): Promise<CancelCallOutcome> {
    const doctorProfileId = await resolveDoctorId(admin, input.doctorUserId)
    if (!doctorProfileId) {
      return { kind: 'forbidden', message: 'doctor_not_found' }
    }

    const call = await callResponseRepo.findById(admin, input.callId)
    if (!call) {
      return { kind: 'not_found', message: 'call_not_found' }
    }

    if (!matchesDoctor(doctorProfileId, call.doctor_id, input.doctorUserId)) {
      return { kind: 'forbidden', message: 'call_access_denied' }
    }

    const transition = resolveDoctorCancelStatus(call.status)
    if (transition.kind === 'conflict') {
      return transition
    }

    if (!transition.changed) {
      return {
        kind: 'ok',
        data: {
          callId: call.id,
          roomId: call.room_id,
          status: 'canceled',
          changed: false,
          reason: input.reason,
        },
      }
    }

    const updated = await callResponseRepo.updateCallStatus(
      actorSupabase,
      call.id,
      'canceled',
      input.reason,
    )

    if (!updated) {
      throw new Error('Unable to update call status to canceled')
    }

    return {
      kind: 'ok',
      data: {
        callId: call.id,
        roomId: call.room_id,
        status: 'canceled',
        changed: true,
        reason: input.reason,
      },
    }
  },
}
