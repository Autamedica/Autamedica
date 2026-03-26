import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import type { CallStatus } from '@autamedica/telemedicine'
import { callResponseRepo } from '@/lib/calls/repos/call-response.repo'

type Db = SupabaseClient<Database>

interface CallStatusViewer {
  userId: string
  doctorProfileId: string | null
  patientProfileId: string | null
}

export interface PersistCallStatusRequest {
  callId: string
  status: 'connecting' | 'connected' | 'ended'
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

const TERMINAL_STATUSES = new Set<CallStatus>(['declined', 'canceled', 'ended'])

function matchesParticipant(
  participantId: string | null,
  callParticipantId: string,
  userId: string,
): boolean {
  return callParticipantId === userId || (participantId !== null && callParticipantId === participantId)
}

function resolveCurrentStatus(
  requestedStatus: PersistCallStatusRequest['status'],
  currentStatus: CallStatus,
): PersistCallStatusOutcome | null {
  if (requestedStatus === 'connecting') {
    if (TERMINAL_STATUSES.has(currentStatus)) {
      return { kind: 'conflict', message: 'call_not_joinable' }
    }

    if (currentStatus === 'connecting' || currentStatus === 'connected') {
      return {
        kind: 'ok',
        data: {
          callId: '',
          roomId: '',
          status: currentStatus,
          changed: false,
        },
      }
    }

    return null
  }

  if (requestedStatus === 'connected') {
    if (TERMINAL_STATUSES.has(currentStatus)) {
      return { kind: 'conflict', message: 'call_not_connectable' }
    }

    if (currentStatus === 'connected') {
      return {
        kind: 'ok',
        data: {
          callId: '',
          roomId: '',
          status: 'connected',
          changed: false,
        },
      }
    }

    return null
  }

  if (TERMINAL_STATUSES.has(currentStatus)) {
    return {
      kind: 'ok',
      data: {
        callId: '',
        roomId: '',
        status: currentStatus,
        changed: false,
      },
    }
  }

  return null
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

    const currentStatusOutcome = resolveCurrentStatus(input.status, call.status)
    if (currentStatusOutcome) {
      if (currentStatusOutcome.kind === 'ok') {
        currentStatusOutcome.data.callId = call.id
        currentStatusOutcome.data.roomId = call.room_id
      }
      return currentStatusOutcome
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
        status: input.status,
        changed: true,
      },
    }
  },
}
