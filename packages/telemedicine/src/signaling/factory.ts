import { getClientEnvOrDefault, getOptionalClientEnv } from '@autamedica/shared'
import { SignalingClient } from './client'

export function createSignaling(
  userId: string,
  userType: 'doctor' | 'patient',
  roomId?: string
) {
  const base = getClientEnvOrDefault(
    'NEXT_PUBLIC_SIGNALING_URL',
    'wss://autamedica-signaling-server.marques-eduardo95466020.workers.dev/signaling'
  )
  const qs = new URLSearchParams({
    userId,
    userType,
    ...(roomId ? { roomId } : {}),
  })
  const _wsUrl = `${base}?${qs.toString()}`
  const _debug = getOptionalClientEnv('NEXT_PUBLIC_WEBRTC_DEBUG') === '1'
  return new SignalingClient(userId, userType, roomId)
}