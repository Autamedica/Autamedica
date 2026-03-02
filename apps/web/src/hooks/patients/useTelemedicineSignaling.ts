'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  TelemedicineClient,
  type TelemedicineRole,
  type ConnectionState,
} from '@autamedica/telemedicine'
import { getClientEnvOrDefault } from '@autamedica/shared'

export type SignalingConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'

export interface UseTelemedicineSignalingConfig {
  roomId: string
  userId: string
  userType: TelemedicineRole
  metadata?: Record<string, unknown>
  token?: string
  signalingUrl?: string
  autoReconnect?: boolean
}

export interface TelemedicineSignalingState {
  connectionState: SignalingConnectionState
  participants: Array<{ id: string; userType: TelemedicineRole }>
  remoteStream: MediaStream | null
  error: Error | null
}

export interface TelemedicineSignalingControls {
  connect: () => Promise<void>
  disconnect: () => void
}

function mapConnectionState(state: ConnectionState, autoReconnect: boolean): SignalingConnectionState {
  switch (state) {
    case 'connecting':
      return 'connecting'
    case 'connected':
      return 'connected'
    case 'disconnected':
      return autoReconnect ? 'reconnecting' : 'disconnected'
    case 'failed':
      return 'disconnected'
    case 'closed':
      return 'disconnected'
    default:
      return 'idle'
  }
}

export function useTelemedicineSignaling(config: UseTelemedicineSignalingConfig) {
  const [state, setState] = useState<TelemedicineSignalingState>({
    connectionState: 'idle',
    participants: [],
    remoteStream: null,
    error: null,
  })

  const clientRef = useRef<TelemedicineClient | null>(null)

  const normalizedConfig = useMemo(
    () => ({
      signalingUrl:
        config.signalingUrl ?? getClientEnvOrDefault('NEXT_PUBLIC_SIGNALING_URL', 'wss://autamedica-signaling-server.marques-eduardo95466020.workers.dev/signaling'),
      roomId: config.roomId,
      userId: config.userId,
      userType: config.userType as 'doctor' | 'patient' | 'nurse',
      autoReconnect: config.autoReconnect ?? true,
    }),
    [config.autoReconnect, config.roomId, config.signalingUrl, config.userId, config.userType],
  )

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const client = new TelemedicineClient({
      signalingUrl: normalizedConfig.signalingUrl,
      roomId: normalizedConfig.roomId,
      userId: normalizedConfig.userId,
      userType: normalizedConfig.userType,
    })
    clientRef.current = client

    const unsubscribes = [
      client.on('connection-state', (connectionState: ConnectionState) => {
        setState((prev) => ({
          ...prev,
          connectionState: mapConnectionState(connectionState, normalizedConfig.autoReconnect),
          error: connectionState === 'connected' ? null : prev.error,
        }))
      }),
      client.on('error', (error: Error) => {
        setState((prev) => ({ ...prev, error }))
      }),
      client.on('user-joined', (userId: string, userType: string) => {
        setState((prev) => ({
          ...prev,
          participants: addOrUpdateParticipant(prev.participants, {
            id: userId,
            userType: (userType as TelemedicineRole) ?? 'unknown',
          }),
        }))
      }),
      client.on('user-left', (userId: string) => {
        setState((prev) => ({
          ...prev,
          participants: prev.participants.filter((participant) => participant.id !== userId),
        }))
      }),
      client.on('remote-stream', (stream: MediaStream) => {
        setState((prev) => ({ ...prev, remoteStream: stream }))
      }),
    ]

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe())
      client.disconnect()
      clientRef.current = null
    }
  }, [normalizedConfig])

  const connect = async () => {
    if (!clientRef.current) {
      throw new Error('Telemedicine client not initialized')
    }
    setState((prev) => ({ ...prev, connectionState: 'connecting', error: null }))
    await clientRef.current.connect(normalizedConfig.roomId)
  }

  const disconnect = () => {
    clientRef.current?.disconnect()
    setState((prev) => ({
      ...prev,
      connectionState: 'disconnected',
    }))
  }

  return {
    state,
    controls: {
      connect,
      disconnect,
    },
  }
}

function addOrUpdateParticipant(
  list: Array<{ id: string; userType: TelemedicineRole }>,
  next: { id: string; userType: TelemedicineRole },
) {
  const existing = list.find((participant) => participant.id === next.id)
  if (existing) {
    return list.map((participant) => (participant.id === next.id ? next : participant))
  }
  return [...list, next]
}
