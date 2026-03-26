import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import type { CallStatus } from '@autamedica/telemedicine'
import { callResponseRepo } from '@/lib/calls/repos/call-response.repo'
import {
  resolvePersistCallStatus,
  type PersistableCallStatus,
} from '@/lib/calls/services/call-status-rules'

type Db = SupabaseClient<Database>

interface CallStatusViewer {
  userId: string
  doctorProfileId: string | null
  patientProfileId: string | null
}

export interface PersistCallStatusRequest {
  callId: string
  status: PersistableCallStatus
  reason?: string
  viewer: CallStatusViewer
}

export interface PersistCallStatusResponse {
  callId: string
  roomId: string
  status: CallStatus
  changed: boolean
}

type PersistCallStatusOutcome =
  | { kind: 'ok'; data: PersistCallStatusResponse }
  | { kind: 'not_found'; message: string }
  | { kind: 'forbidden'; message: string }
  | { kind: 'conflict'; message: string }

function matchesParticipant(
  participantId: string | null,
  callParticipantId: string,
  userId: string,
): boolean {
  return callParticipantId === userId || (participantId !== null && callParticipantId === participantId)
}

export const persistCallStatusService = {
  async persist(
    admin: Db,
    actorSupabase: Db,
    input: PersistCallStatusRequest,
  ): Promise<PersistCallStatusOutcome> {
    const call = await callResponseRepo.findById(admin, input.callId)
    if (!call) {
      return { kind: 'not_found', message: 'call_not_found' }
    }

    const isDoctor = matchesParticipant(input.viewer.doctorProfileId, call.doctor_id, input.viewer.userId)
    const isPatient = matchesParticipant(input.viewer.patientProfileId, call.patient_id, input.viewer.userId)

    if (!isDoctor && !isPatient) {
      return { kind: 'forbidden', message: 'call_access_denied' }
    }

    const transition = resolvePersistCallStatus(input.status, call.status)
    if (transition.kind === 'conflict') {
      return transition
    }

    if (!transition.changed) {
      return {
        kind: 'ok',
        data: {
          callId: call.id,
          roomId: call.room_id,
          status: transition.effectiveStatus,
          changed: false,
        },
      }
    }

    const updated = await callResponseRepo.updateCallStatus(
      actorSupabase,
      call.id,
      input.status,
      input.reason,
    )

    if (!updated) {
      throw new Error(`Unable to update call status to ${input.status}`)
    }

    return {
      kind: 'ok',
      data: {
        callId: call.id,
        roomId: call.room_id,
        status: transition.effectiveStatus,
        changed: true,
      },
    }
  },
}
