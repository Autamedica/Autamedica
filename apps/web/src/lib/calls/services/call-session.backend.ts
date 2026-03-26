import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import type { Call, CallSessionBootstrap, CallSessionRole, CallSessionRuntime } from '@autamedica/telemedicine'
import { callSessionRepo } from '@/lib/calls/repos/call-session.repo'

type Db = SupabaseClient<Database>

type BootstrapResolution =
  | { kind: 'ok'; data: CallSessionBootstrap }
  | { kind: 'not_found' }
  | { kind: 'conflict'; message: string }
  | { kind: 'forbidden' }

const TERMINAL_CALL_STATUSES = new Set(['declined', 'canceled', 'ended'] as const)

function matchesParticipant(participantId: string | null, callParticipantId: string, userId: string): boolean {
  return callParticipantId === userId || (participantId !== null && callParticipantId === participantId)
}

function resolveRuntime(): CallSessionRuntime {
  const hasCloudflareCalls =
    Boolean(import.meta.env.CLOUDFLARE_CALLS_APP_ID) &&
    Boolean(import.meta.env.CLOUDFLARE_CALLS_APP_SECRET)

  return hasCloudflareCalls ? 'cloudflare-calls' : 'webrtc-p2p'
}

function buildWaitingRoom(call: Call, role: CallSessionRole): CallSessionBootstrap['waitingRoom'] {
  const enabled =
    role === 'doctor'
      ? call.status === 'requested' || call.status === 'ringing'
      : call.status === 'ringing'

  if (!enabled) {
    return { enabled: false }
  }

  return {
    enabled: true,
    message:
      role === 'doctor'
        ? 'Esperando que el paciente se una a la videollamada.'
        : 'El medico esta preparando la videollamada.',
  }
}

function buildBootstrap(
  call: Call,
  viewerUserId: string,
  viewerRole: CallSessionRole,
  displayName?: string,
): CallSessionBootstrap {
  const runtime = resolveRuntime()
  const cloudflareCallsApiUrl =
    runtime === 'cloudflare-calls'
      ? viewerRole === 'doctor'
        ? '/api/doctors/cloudflare-calls'
        : '/api/patients/cloudflare-calls'
      : null

  return {
    callId: call.id,
    roomId: call.room_id,
    appointmentId: call.appointment_id ?? null,
    runtime,
    user: {
      id: viewerUserId,
      role: viewerRole,
      ...(displayName ? { displayName } : {}),
    },
    permissions: {
      canJoin: !TERMINAL_CALL_STATUSES.has(call.status),
      canPublishAudio: true,
      canPublishVideo: true,
      canUseChat: true,
      canRecord: viewerRole === 'doctor',
    },
    mediaPolicy: {
      requireCamera: false,
      requireMicrophone: true,
      allowAudioOnlyFallback: true,
    },
    transport: {
      cloudflareCallsApiUrl,
    },
    waitingRoom: buildWaitingRoom(call, viewerRole),
  }
}

export const callSessionBackendService = {
  async getBootstrap(supabase: Db, roomId: string, viewerUserId: string): Promise<BootstrapResolution> {
    const call = await callSessionRepo.findLatestByRoomId(supabase, roomId)

    if (!call) {
      return { kind: 'not_found' }
    }

    if (TERMINAL_CALL_STATUSES.has(call.status)) {
      const message =
        call.status === 'ended'
          ? 'call_ended'
          : call.status === 'canceled'
            ? 'call_canceled'
            : 'call_declined'

      return {
        kind: 'conflict',
        message,
      }
    }

    const [doctorProfileId, patientProfileId, displayName] = await Promise.all([
      callSessionRepo.resolveDoctorProfileIdByUserId(supabase, viewerUserId),
      callSessionRepo.resolvePatientProfileIdByUserId(supabase, viewerUserId),
      callSessionRepo.resolveDisplayNameByUserId(supabase, viewerUserId),
    ])

    if (matchesParticipant(doctorProfileId, call.doctor_id, viewerUserId)) {
      return {
        kind: 'ok',
        data: buildBootstrap(call, viewerUserId, 'doctor', displayName),
      }
    }

    if (matchesParticipant(patientProfileId, call.patient_id, viewerUserId)) {
      return {
        kind: 'ok',
        data: buildBootstrap(call, viewerUserId, 'patient', displayName),
      }
    }

    logger.warn('[callSessionBackendService] access denied to room', {
      roomId,
      viewerUserId,
      callId: call.id,
    })

    return { kind: 'forbidden' }
  },
}
