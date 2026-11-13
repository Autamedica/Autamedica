import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import type { Call, CallSessionBootstrap, CallSessionRole, CallSessionRuntime } from '@autamedica/telemedicine'
import { getIceServersConfig, hasTurnIceServer } from '@autamedica/telemedicine'
import { handleTurnCredentials } from '@autamedica/telemedicine/server'
import { callSessionRepo } from '@/lib/calls/repos/call-session.repo'
import { resolveCloudflareCallsEnv } from '@/lib/runtime-env'

type Db = SupabaseClient<Database>

type BootstrapResolution =
  | { kind: 'ok'; data: CallSessionBootstrap }
  | { kind: 'not_found' }
  | { kind: 'conflict'; message: string }
  | { kind: 'forbidden' }

const TERMINAL_CALL_STATUSES = new Set<Call['status']>(['declined', 'canceled', 'ended'])
const DOCTOR_NO_ANSWER_TIMEOUT_MS = 300_000

function matchesParticipant(participantId: string | null, callParticipantId: string, userId: string): boolean {
  return callParticipantId === userId || (participantId !== null && callParticipantId === participantId)
}

/** @internal Exported for testing only. */
export function resolveRuntime(): CallSessionRuntime {
  if (import.meta.env.PUBLIC_FORCE_WEBRTC_P2P === 'true') {
    logger.info('[resolveRuntime] Forced to webrtc-p2p via PUBLIC_FORCE_WEBRTC_P2P')
    return 'webrtc-p2p'
  }

  const { appId, appSecret } = resolveCloudflareCallsEnv()
  const hasCloudflareCalls = Boolean(appId) && Boolean(appSecret)

  if (hasCloudflareCalls) return 'cloudflare-calls'

  if (import.meta.env.PROD) {
    logger.error('[resolveRuntime] CLOUDFLARE_CALLS credentials missing in production — call bootstrap will fail')
    throw new Error('Cloudflare Calls credentials are required in production. Set CLOUDFLARE_CALLS_APP_ID and CLOUDFLARE_CALLS_APP_SECRET.')
  }

  logger.warn('[resolveRuntime] No Cloudflare Calls credentials — falling back to webrtc-p2p (dev only)')
  return 'webrtc-p2p'
}

function buildWaitingRoom(call: Call, role: CallSessionRole, peerName?: string): CallSessionBootstrap['waitingRoom'] {
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
        ? `Esperando que ${peerName ?? 'el paciente'} se una a la videollamada.`
        : `El medico esta preparando la videollamada.`,
    deadlineAt:
      role === 'doctor'
        ? new Date(new Date(call.created_at).getTime() + DOCTOR_NO_ANSWER_TIMEOUT_MS).toISOString()
        : undefined,
  }
}

async function fetchCloudflareTurnServers(): Promise<RTCIceServer[]> {
  const { turnKeyId, turnToken } = resolveCloudflareCallsEnv()
  if (!turnKeyId || !turnToken) {
    logger.warn('[fetchCloudflareTurnServers] CLOUDFLARE_CALLS_TURN_KEY_ID or CLOUDFLARE_CALLS_TURN_TOKEN not set')
    return []
  }

  const result = await handleTurnCredentials({ keyId: turnKeyId, token: turnToken })
  if (result.status !== 200) return []

  const body = result.body as { ok: boolean; iceServers?: RTCIceServer[] }
  return body.ok && Array.isArray(body.iceServers) ? body.iceServers : []
}

async function buildBootstrap(
  call: Call,
  viewerUserId: string,
  viewerRole: CallSessionRole,
  displayName?: string,
  peer?: { id: string; displayName?: string },
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
    peer,
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
    waitingRoom: buildWaitingRoom(call, viewerRole, peer?.displayName),
  }
}

export const callSessionBackendService = {
  async getBootstrap(supabase: Db, roomId: string, viewerUserId: string): Promise<BootstrapResolution> {
    const call = await callSessionRepo.findLatestByRoomId(supabase, roomId)

    if (!call) {
      return { kind: 'not_found' }
    }

    if (TERMINAL_CALL_STATUSES.has(call.status)) {
      // Grace period: if call ended recently (< 5 min), allow joining to recover from disconnects
      const endedAt = call.ended_at ? new Date(call.ended_at).getTime() : 0;
      const now = Date.now();
      const isRecentlyEnded = call.status === 'ended' && (now - endedAt < 300_000); // 5 minutes

      if (!isRecentlyEnded) {
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
      
      logger.info(`[callSessionBackendService] Allowing join for recently ended call (${call.id}) via grace period`);
    }

    const [doctorProfileId, patientProfileId, displayName] = await Promise.all([
      callSessionRepo.resolveDoctorProfileIdByUserId(supabase, viewerUserId),
      callSessionRepo.resolvePatientProfileIdByUserId(supabase, viewerUserId),
      callSessionRepo.resolveDisplayNameByUserId(supabase, viewerUserId),
    ])

    if (matchesParticipant(doctorProfileId, call.doctor_id, viewerUserId)) {
      // Viewer is DOCTOR, resolve patient name
      const peerUserId = await callSessionRepo.resolvePatientUserId(supabase, call.patient_id)
      const peerDisplayName = peerUserId ? await callSessionRepo.resolveDisplayNameByUserId(supabase, peerUserId) : undefined
      
      const data = await buildBootstrap(call, viewerUserId, 'doctor', displayName, {
        id: peerUserId ?? call.patient_id,
        displayName: peerDisplayName,
      })
      
      if (data.runtime === 'webrtc-p2p' && !hasTurnIceServer(data.transport.iceServers ?? [])) {
        logger.warn('[callSessionBackendService] p2p bootstrap without TURN', { roomId, callId: call.id, role: 'doctor' })
      }
      return { kind: 'ok', data }
    }

    if (matchesParticipant(patientProfileId, call.patient_id, viewerUserId)) {
      // Viewer is PATIENT, resolve doctor name
      const peerUserId = await callSessionRepo.resolveDoctorUserId(supabase, call.doctor_id)
      const peerDisplayName = peerUserId ? await callSessionRepo.resolveDisplayNameByUserId(supabase, peerUserId) : undefined

      const data = await buildBootstrap(call, viewerUserId, 'patient', displayName, {
        id: peerUserId ?? call.doctor_id,
        displayName: peerDisplayName,
      })

      if (data.runtime === 'webrtc-p2p' && !hasTurnIceServer(data.transport.iceServers ?? [])) {
        logger.warn('[callSessionBackendService] p2p bootstrap without TURN', { roomId, callId: call.id, role: 'patient' })
      }
      return { kind: 'ok', data }
    }

    logger.warn('[callSessionBackendService] access denied to room — participant match failed', {
      roomId,
      viewerUserId,
      callDoctorId: call.doctor_id,
      callPatientId: call.patient_id,
      resolvedDoctorProfileId: doctorProfileId,
      resolvedPatientProfileId: patientProfileId,
      callId: call.id,
      callStatus: call.status,
    })

    return { kind: 'forbidden' }
  },

  async getGuestBootstrap(
    supabase: Db,
    roomId: string,
    guest: { callId: string; roomId: string; guestName: string },
    guestToken: string,
    authorizedDispatchRequestId: string | null = null,
  ): Promise<BootstrapResolution> {
    const call = await callSessionRepo.findLatestByRoomId(supabase, roomId)

    if (!call) {
      return { kind: 'not_found' }
    }

    // For QR dispatch, the issued guest token refers to the dispatch UUID;
    // the resulting call has a separately generated calls.id. The route
    // verifies their relationship before passing this trusted ID.
    if ((call.id !== guest.callId && authorizedDispatchRequestId !== guest.callId)
      || call.room_id !== guest.roomId) {
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
      const hasCf =
        Boolean(import.meta.env.CLOUDFLARE_CALLS_APP_ID) &&
        Boolean(import.meta.env.CLOUDFLARE_CALLS_APP_SECRET)
      if (hasCf) {
        runtime = 'cloudflare-calls'
      } else {
        logger.error('[callSessionBackendService] Guest call requires Cloudflare Calls but credentials missing')
        return { kind: 'conflict', message: 'guest_calls_unavailable' }
      }
    }

    const turnServers = await fetchCloudflareTurnServers()
    const iceServers = turnServers.length > 0 ? turnServers : getIceServersConfig()

    // Resolve doctor name for guest
    const peerUserId = await callSessionRepo.resolveDoctorUserId(supabase, call.doctor_id)
    const peerDisplayName = peerUserId ? await callSessionRepo.resolveDisplayNameByUserId(supabase, peerUserId) : undefined

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
      peer: {
        id: peerUserId ?? call.doctor_id,
        displayName: peerDisplayName,
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
