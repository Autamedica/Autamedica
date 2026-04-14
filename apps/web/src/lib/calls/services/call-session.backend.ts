import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import type { Call, CallSessionBootstrap, CallSessionRole, CallSessionRuntime } from '@autamedica/telemedicine'
import { getIceServersConfig, hasTurnIceServer } from '@autamedica/telemedicine'
import { handleTurnCredentials } from '@autamedica/telemedicine/server'
import { callSessionRepo } from '@/lib/calls/repos/call-session.repo'
import { getRuntimeEnvValue } from '@/lib/runtime-env'

type Db = SupabaseClient<Database>

type BootstrapResolution =
  | { kind: 'ok'; data: CallSessionBootstrap }
  | { kind: 'not_found' }
  | { kind: 'conflict'; message: string }
  | { kind: 'forbidden' }

const TERMINAL_CALL_STATUSES = new Set<Call['status']>(['declined', 'canceled', 'ended'])
const DOCTOR_NO_ANSWER_TIMEOUT_MS = 60_000

function matchesParticipant(participantId: string | null, callParticipantId: string, userId: string): boolean {
  return callParticipantId === userId || (participantId !== null && callParticipantId === participantId)
}

/** @internal Exported for testing only. */
export function resolveRuntime(): CallSessionRuntime {
  if (import.meta.env.PUBLIC_FORCE_WEBRTC_P2P === 'true') {
    logger.info('[resolveRuntime] Forced to webrtc-p2p via PUBLIC_FORCE_WEBRTC_P2P')
    return 'webrtc-p2p'
  }

  const appId =
    import.meta.env.CLOUDFLARE_CALLS_APP_ID ||
    getRuntimeEnvValue('CLOUDFLARE_CALLS_APP_ID')
  const appSecret =
    import.meta.env.CLOUDFLARE_CALLS_APP_SECRET ||
    getRuntimeEnvValue('CLOUDFLARE_CALLS_APP_SECRET')
  const hasCloudflareCalls = Boolean(appId) && Boolean(appSecret)

  if (hasCloudflareCalls) return 'cloudflare-calls'

  if (import.meta.env.PROD) {
    logger.error('[resolveRuntime] CLOUDFLARE_CALLS credentials missing in production — call bootstrap will fail')
    throw new Error('Cloudflare Calls credentials are required in production. Set CLOUDFLARE_CALLS_APP_ID and CLOUDFLARE_CALLS_APP_SECRET.')
  }

  logger.warn('[resolveRuntime] No Cloudflare Calls credentials — falling back to webrtc-p2p (dev only)')
  return 'webrtc-p2p'
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
    deadlineAt:
      role === 'doctor'
        ? new Date(new Date(call.created_at).getTime() + DOCTOR_NO_ANSWER_TIMEOUT_MS).toISOString()
        : undefined,
  }
}

async function fetchCloudflareTurnServers(): Promise<RTCIceServer[]> {
  const keyId = import.meta.env.CLOUDFLARE_CALLS_TURN_KEY_ID
  const token = import.meta.env.CLOUDFLARE_CALLS_TURN_TOKEN
  if (!keyId || !token) {
    logger.warn('[fetchCloudflareTurnServers] CLOUDFLARE_CALLS_TURN_KEY_ID or CLOUDFLARE_CALLS_TURN_TOKEN not set')
    return []
  }

  const result = await handleTurnCredentials({ keyId, token })
  if (result.status !== 200) return []

  const body = result.body as { ok: boolean; iceServers?: RTCIceServer[] }
  return body.ok && Array.isArray(body.iceServers) ? body.iceServers : []
}

async function buildBootstrap(
  call: Call,
  viewerUserId: string,
  viewerRole: CallSessionRole,
  displayName?: string,
): Promise<CallSessionBootstrap> {
  const runtime = resolveRuntime()
  const cloudflareCallsApiUrl =
    runtime === 'cloudflare-calls'
      ? viewerRole === 'doctor'
        ? '/api/doctors/cloudflare-calls'
        : '/api/patients/cloudflare-calls'
      : null

  // Always fetch TURN — needed for P2P, and improves connectivity for SFU too
  const turnServers = await fetchCloudflareTurnServers()
  if (turnServers.length === 0) {
    logger.warn('[callSession.bootstrap] TURN fetch returned empty — falling back to STUN-only', { roomId: call.room_id, runtime })
  }
  const iceServers = turnServers.length > 0 ? turnServers : getIceServersConfig()

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
      iceServers,
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
      const data = await buildBootstrap(call, viewerUserId, 'doctor', displayName)
      if (data.runtime === 'webrtc-p2p' && !hasTurnIceServer(data.transport.iceServers ?? [])) {
        logger.warn('[callSessionBackendService] p2p bootstrap without TURN', { roomId, callId: call.id, role: 'doctor' })
      }
      return { kind: 'ok', data }
    }

    if (matchesParticipant(patientProfileId, call.patient_id, viewerUserId)) {
      const data = await buildBootstrap(call, viewerUserId, 'patient', displayName)
      if (data.runtime === 'webrtc-p2p' && !hasTurnIceServer(data.transport.iceServers ?? [])) {
        logger.warn('[callSessionBackendService] p2p bootstrap without TURN', { roomId, callId: call.id, role: 'patient' })
      }
      return { kind: 'ok', data }
    }

    logger.warn('[callSessionBackendService] access denied to room', {
      roomId,
      viewerUserId,
      callId: call.id,
    })

    return { kind: 'forbidden' }
  },

  async getGuestBootstrap(
    supabase: Db,
    roomId: string,
    guest: { callId: string; roomId: string; guestName: string },
    guestToken: string,
  ): Promise<BootstrapResolution> {
    const call = await callSessionRepo.findLatestByRoomId(supabase, roomId)

    if (!call) {
      return { kind: 'not_found' }
    }

    if (call.id !== guest.callId || call.room_id !== guest.roomId) {
      return { kind: 'forbidden' }
    }

    if (TERMINAL_CALL_STATUSES.has(call.status)) {
      const message =
        call.status === 'ended'
          ? 'call_ended'
          : call.status === 'canceled'
            ? 'call_canceled'
            : 'call_declined'
      return { kind: 'conflict', message }
    }

    // Guest always uses Cloudflare Calls SFU (no Supabase Realtime for signaling)
    let runtime = resolveRuntime()
    if (runtime === 'webrtc-p2p') {
      logger.error('[callSessionBackendService] Guest call requires Cloudflare Calls but credentials missing')
      return { kind: 'conflict', message: 'guest_calls_unavailable' }
    }

    const turnServers = await fetchCloudflareTurnServers()
    const iceServers = turnServers.length > 0 ? turnServers : getIceServersConfig()

    const data: CallSessionBootstrap = {
      callId: call.id,
      roomId: call.room_id,
      appointmentId: null,
      runtime,
      user: {
        id: `guest:${call.id}`,
        role: 'guest',
        displayName: guest.guestName,
      },
      permissions: {
        canJoin: true,
        canPublishAudio: true,
        canPublishVideo: true,
        canUseChat: false,
        canRecord: false,
      },
      mediaPolicy: {
        requireCamera: false,
        requireMicrophone: true,
        allowAudioOnlyFallback: true,
      },
      transport: {
        iceServers,
        cloudflareCallsApiUrl: `/api/calls/guest/cloudflare-calls?token=${encodeURIComponent(guestToken)}`,
      },
      waitingRoom: { enabled: false },
    }

    return { kind: 'ok', data }
  },
}
