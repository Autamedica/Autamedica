import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import type { CallStatus } from '@autamedica/telemedicine'
import { callResponseRepo } from '@/lib/calls/repos/call-response.repo'

type Db = SupabaseClient<Database>

export type CallResponseAction = 'accept' | 'decline'

export interface RespondToCallRequest {
  patientId: string
  callId: string
  action: CallResponseAction
}

export interface RespondToCallResponse {
  callId: string
  roomId: string
  status: CallStatus
  changed: boolean
}

type RespondToCallOutcome =
  | { kind: 'ok'; data: RespondToCallResponse }
  | { kind: 'not_found'; message: string }
  | { kind: 'forbidden'; message: string }
  | { kind: 'conflict'; message: string }

const ACCEPTABLE_ACCEPT_STATUSES = new Set<CallStatus>(['requested', 'ringing'])
const ACCEPT_ALREADY_RESOLVED_STATUSES = new Set<CallStatus>(['accepted', 'connecting', 'connected'])
const DECLINABLE_STATUSES = new Set<CallStatus>(['requested', 'ringing'])
const DECLINE_ALREADY_RESOLVED_STATUSES = new Set<CallStatus>(['declined', 'canceled', 'ended'])

export const respondCallService = {
  async respond(
    admin: Db,
    actorSupabase: Db,
    input: RespondToCallRequest,
  ): Promise<RespondToCallOutcome> {
    const call = await callResponseRepo.findById(admin, input.callId)
    if (!call) {
      return { kind: 'not_found', message: 'call_not_found' }
    }

    if (call.patient_id !== input.patientId) {
      return { kind: 'forbidden', message: 'call_access_denied' }
    }

    if (input.action === 'accept') {
      if (ACCEPT_ALREADY_RESOLVED_STATUSES.has(call.status)) {
        return {
          kind: 'ok',
          data: {
            callId: call.id,
            roomId: call.room_id,
            status: call.status,
            changed: false,
          },
        }
      }

      if (!ACCEPTABLE_ACCEPT_STATUSES.has(call.status)) {
        return { kind: 'conflict', message: 'call_not_accepting_patients' }
      }

      const updated = await callResponseRepo.updateCallStatus(actorSupabase, call.id, 'accepted')
      if (!updated) {
        throw new Error('Unable to update call status to accepted')
      }

      return {
        kind: 'ok',
        data: {
          callId: call.id,
          roomId: call.room_id,
          status: 'accepted',
          changed: true,
        },
      }
    }

    if (DECLINE_ALREADY_RESOLVED_STATUSES.has(call.status)) {
      return {
        kind: 'ok',
        data: {
          callId: call.id,
          roomId: call.room_id,
          status: call.status,
          changed: false,
        },
      }
    }

    if (!DECLINABLE_STATUSES.has(call.status)) {
      return { kind: 'conflict', message: 'call_not_declinable' }
    }

    const updated = await callResponseRepo.updateCallStatus(
      actorSupabase,
      call.id,
      'declined',
      'patient_declined',
    )
    if (!updated) {
      throw new Error('Unable to update call status to declined')
    }

    return {
      kind: 'ok',
      data: {
        callId: call.id,
        roomId: call.room_id,
        status: 'declined',
        changed: true,
      },
    }
  },
}
