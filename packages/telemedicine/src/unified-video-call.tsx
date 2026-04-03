'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { JSX } from 'react'
import { logger } from '@autamedica/shared'
import { patchVideoPlayback } from './media-optimizations'
import type { CallService } from './calls/service'
import type { CallStatus } from './calls/types'
import { hasTurnIceServer } from './config/ice-servers'
import {
  WebRTCClient,
  type ConnectionState,
  type DeviceInfo,
  type WarmUpResult,
} from './webrtc-client'
import { CloudflareCallsClient } from './cloudflare-calls'
import { useCallRecording } from './hooks/useCallRecording'
import { useCallDuration } from './hooks/useCallDuration'
import { useCallQuality } from './hooks/useCallQuality'
import { useAutoHideControls } from './hooks/useAutoHideControls'
import { useGreenRoom } from './hooks/useGreenRoom'
import { sanitizeErrorForUser } from './utils/error-messages'
import { hasRemoteVideoEvidence } from './utils/stream-helpers'
import { useViewportDetection } from './hooks/useViewportDetection'
import { useParticipantSound } from './hooks/useParticipantSound'
import { useChatMessages } from './hooks/useChatMessages'
import { useScreenShare } from './hooks/useScreenShare'
import { useCallStatusPersistence } from './hooks/useCallStatusPersistence'
import { useCallDebugger } from './hooks/useCallDebugger'
import { useRemoteMediaTimeout } from './hooks/useRemoteMediaTimeout'
import { useCallLifecycleEffects } from './hooks/useCallLifecycleEffects'
import { useNetworkPreflight } from './hooks/useNetworkPreflight'
import { AutoDegradeService } from './quality/auto-degrade'
import { deriveCallSessionPhase } from './runtime/call-session-phase'
import {
  GreenRoom,
  ConnectingOverlay,
  ActiveCallLayout,
  CallTopBar,
  CallControlsBar,
  ChatPanel,
  ReconnectingOverlay,
  QualityOverlays,
} from './components'

type UnifiedVideoCallService = Pick<CallService, 'updateCallStatus' | 'logDebugEvent' | 'logEvent'>

export interface UnifiedVideoCallProps {
  roomId: string
  callId?: string
  userId: string
  userType: 'doctor' | 'patient' | 'nurse'
  userName?: string
  /** ICE servers pre-fetched by el parent (e.g. from /api/turn-credentials). Falls back to STUN-only. */
  iceServers?: RTCIceServer[]
  /**
   * URL del proxy API para Cloudflare Calls SFU (e.g., '/api/cloudflare-calls').
   * - `undefined` (default): usa '/api/cloudflare-calls' automáticamente.
   * - `null`: opt-out explícito, usa WebRTC P2P directo.
   * - string: URL personalizada del proxy.
   */
  cloudflareCallsApiUrl?: string | null
  onCallEnd?: () => void
  onCallStart?: () => void
  onStatusChange?: (status: ConnectionState) => void
  onError?: (error: unknown) => void
  persistCallStatus?: (status: CallStatus, reason?: string) => Promise<void>
  callService?: UnifiedVideoCallService
  className?: string
  theme?: 'doctor' | 'patient'
  autoStart?: boolean
}

interface RemoteUser {
  userId: string
  userType: string
  userName?: string
  stream?: MediaStream
}

const QUALITY_WARMUP_MS = 15000

export function UnifiedVideoCall({
  roomId,
  callId,
  userId,
  userType,
  userName,
  iceServers,
  cloudflareCallsApiUrl,
  onCallEnd,
  onCallStart,
  onStatusChange,
  onError,
  persistCallStatus: persistCallStatusOverride,
  callService: callServiceOverride,
  className = '',
  theme = userType === 'doctor' ? 'doctor' : 'patient',
  autoStart = false,
}: UnifiedVideoCallProps): JSX.Element {
  /* ── State ── */
  const [client, setClient] = useState<WebRTCClient | CloudflareCallsClient | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [remoteUsers, setRemoteUsers] = useState<Map<string, RemoteUser>>(new Map())
  const [callError, setCallError] = useState<string | null>(null)
  const [isChatReady, setIsChatReady] = useState(false)
  const [hasPeerConnection, setHasPeerConnection] = useState(false)

  /* ── Retry state ── */
  const [retryKey, setRetryKey] = useState(0)
  const [isRetrying, setIsRetrying] = useState(false)
  const [reconnectionState, setReconnectionState] = useState({
    isReconnecting: false,
    attempt: 0,
    maxAttempts: 0,
  })

  /* ── Refs ── */
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map())
  const screenShareRef = useRef<HTMLVideoElement>(null)
  const chatMessagesRef = useRef<HTMLDivElement>(null)
  const joinSoundPlayedRef = useRef(false)
  const hasStartedCallRef = useRef(false)
  const autoStartAttemptedRef = useRef(false)
  const manualHangupRef = useRef(false)
  const connectedAtRef = useRef<number | null>(null)
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const connectingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ── Callback refs (prevent useEffect re-runs when parent re-renders) ── */
  const onCallStartRef = useRef(onCallStart)
  const onCallEndRef = useRef(onCallEnd)
  const onStatusChangeRef = useRef(onStatusChange)
  const onErrorRef = useRef(onError)
  onCallStartRef.current = onCallStart
  onCallEndRef.current = onCallEnd
  onStatusChangeRef.current = onStatusChange
  onErrorRef.current = onError

  /* ── Recording ── */
  const [recordingState, recordingActions] = useCallRecording()

  /* ── Extracted hooks ── */
  const isDesktopViewport = useViewportDetection()
  const { playParticipantJoinedSound, cleanupSound } = useParticipantSound()
  const { isScreenSharing, setIsScreenSharing, screenStream, setScreenStream, toggleScreenShare } = useScreenShare(client)
  const { persistCallStatus } = useCallStatusPersistence({
    callId,
    callServiceOverride,
    persistCallStatusOverride,
  })

  /* ── Green Room state ── */
  const [warmUpResult, setWarmUpResult] = useState<WarmUpResult | null>(null)
  const [isWarmingUp, setIsWarmingUp] = useState(false)
  const [availableDevices, setAvailableDevices] = useState<DeviceInfo[]>([])
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>('')
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>('')

  /* ── Network Preflight ── */
  const preflightIceServers = useMemo(() => iceServers ?? [], [iceServers])
  const { result: preflightResult, isRunning: preflightRunning, rerun: preflightRerun } = useNetworkPreflight(preflightIceServers)

  /* ── Auto-degrade service ── */
  const autoDegradeRef = useRef<AutoDegradeService | null>(null)
  const [autoDegradeToast, setAutoDegradeToast] = useState<string | null>(null)

  useEffect(() => {
    const service = new AutoDegradeService({
      onDegrade: () => {
        if (client) {
          client.toggleVideo(false)
          setIsVideoEnabled(false)
          setAutoDegradeToast('Conexion inestable — cambiamos a audio para mejor calidad')
          setTimeout(() => setAutoDegradeToast(null), 6000)
        }
      },
      onRecover: () => {
        setAutoDegradeToast('Conexion recuperada — podes activar el video')
        setTimeout(() => setAutoDegradeToast(null), 6000)
      },
    })
    autoDegradeRef.current = service
    return () => service.dispose()
  }, [client])

  /* ── Derived ── */
  const accentColor = theme === 'doctor' ? 'violet' : 'sky'
  const totalParticipants = remoteUsers.size + 1
  const isCallEstablished = hasPeerConnection
  const sessionPhase = deriveCallSessionPhase({ connectionState, hasPeerConnection })
  const isInRoom = sessionPhase === 'room-ready' || sessionPhase === 'peer-ready'
  const isIdle = sessionPhase === 'prejoin'
  const isTestRoom = /^test(?:[-_]|$)/i.test(roomId)
  const remoteUsersWithMedia = useMemo(
    () => Array.from(remoteUsers.values()).filter((user) => user.stream),
    [remoteUsers]
  )
  const isP2PRuntime = cloudflareCallsApiUrl === null

  /* ── Extracted hooks ── */
  const { controlsVisible, resetControlsTimer } = useAutoHideControls({ isInRoom })
  const { formattedDuration } = useCallDuration(isCallEstablished)
  const { audioLevel, greenRoomChecks } = useGreenRoom({ warmUpResult, isInRoom })
  const { emitDebug, logCallEvent } = useCallDebugger({
    callId, roomId, userId, userType, callServiceOverride,
  })

  const {
    qualityLevel, setQualityLevel,
    showAudioOnlySuggestion, setShowAudioOnlySuggestion,
    switchToAudioOnly,
  } = useCallQuality({ client, callError, setCallError, emitDebug })

  const {
    chatMessages, chatInput, setChatInput, unreadMessages,
    isChatPanelOpen, setIsChatPanelOpen, syncPanelRef: syncChatPanelRef,
    addRemoteMessage, sendChat: _sendChat, handleChatSubmit, handleChatKeyDown, toggleChatPanel,
  } = useChatMessages({ client, userId, userType, userName, emitDebug, setCallError })

  /* ── Auto-disable video if preflight recommends audio-only ── */
  useEffect(() => {
    if (preflightResult?.recommendation === 'audio-only' && client && isIdle) {
      client.toggleVideo(false)
      setIsVideoEnabled(false)
    }
  }, [preflightResult, client, isIdle])

  /* ── WebRTC setup ── */
  useEffect(() => {
    syncChatPanelRef(isChatPanelOpen)
  }, [isChatPanelOpen, syncChatPanelRef])

  useEffect(() => {
    emitDebug('info', 'Inicializando componente de videollamada', {
      autoStart,
      userName,
    })

    // cloudflareCallsApiUrl: undefined → default SFU, null → P2P explícito, string → custom URL
    const sfuUrl = cloudflareCallsApiUrl === null
      ? null
      : (cloudflareCallsApiUrl ?? '/api/cloudflare-calls')
    const webrtcClient = sfuUrl
      ? new CloudflareCallsClient({ userId, userName, userType, roomId, apiProxyUrl: sfuUrl })
      : new WebRTCClient({ userId, userName, userType, roomId, ...(iceServers ? { iceServers } : {}) })
    const unsubs: Array<() => void> = []

    unsubs.push(
      webrtcClient.on('connection-state', (state) => {
        setConnectionState(state)
        onStatusChangeRef.current?.(state)
        emitDebug('info', 'Estado de conexion actualizado', { state })
        // Clear connecting timeout on any terminal/success state
        if (connectingTimerRef.current) {
          clearTimeout(connectingTimerRef.current)
          connectingTimerRef.current = null
        }

        if (state === 'failed') {
          setReconnectionState({ isReconnecting: false, attempt: 0, maxAttempts: 0 })
          const MAX_RETRIES = 5
          const attempt = retryCountRef.current
          if (!manualHangupRef.current && autoStart && attempt < MAX_RETRIES) {
            const delayMs = (attempt + 1) * 2000 + Math.random() * 1000
            retryCountRef.current += 1
            setIsRetrying(true)
            setCallError(null)
            emitDebug('warn', `Conexion fallida — reintentando (${retryCountRef.current}/${MAX_RETRIES}) en ${Math.round(delayMs)}ms`)
            retryTimerRef.current = setTimeout(() => {
              autoStartAttemptedRef.current = false
              hasStartedCallRef.current = false
              setRetryKey((k) => k + 1)
            }, delayMs)
          } else {
            setIsRetrying(false)
            setCallError('Error de conexión. Verifica tu internet y recarga la página.')
          }
        } else if (state === 'connecting') {
          setReconnectionState({ isReconnecting: false, attempt: 0, maxAttempts: 0 })
          // Start a connecting timeout — if stuck in "connecting" for too long, force retry
          const CONNECTING_TIMEOUT_MS = 30_000
          connectingTimerRef.current = setTimeout(() => {
            connectingTimerRef.current = null
            emitDebug('warn', 'Conexion colgada en "connecting" por 30s — forzando reintento')
            onStatusChangeRef.current?.('failed')
            setConnectionState('failed')
            const MAX_RETRIES = 5
            const attempt = retryCountRef.current
            if (!manualHangupRef.current && autoStart && attempt < MAX_RETRIES) {
              const delayMs = (attempt + 1) * 2000 + Math.random() * 1000
              retryCountRef.current += 1
              setIsRetrying(true)
              setCallError(null)
              emitDebug('warn', `Timeout connecting — reintentando (${retryCountRef.current}/${MAX_RETRIES}) en ${Math.round(delayMs)}ms`)
              retryTimerRef.current = setTimeout(() => {
                autoStartAttemptedRef.current = false
                hasStartedCallRef.current = false
                setRetryKey((k) => k + 1)
              }, delayMs)
            } else {
              setIsRetrying(false)
              setCallError('Error de conexión. Verifica tu internet y recarga la página.')
            }
          }, CONNECTING_TIMEOUT_MS)
        } else if (state === 'connected') {
          retryCountRef.current = 0
          setIsRetrying(false)
          setCallError(null)
          setReconnectionState({ isReconnecting: false, attempt: 0, maxAttempts: 0 })
        } else if (state === 'disconnected' || state === 'closed') {
          setIsChatReady(false)
          setHasPeerConnection(false)
          setReconnectionState({ isReconnecting: false, attempt: 0, maxAttempts: 0 })
        }
      })
    )

    unsubs.push(
      webrtcClient.on('local-stream', (stream) => {
        // Immediate assignment
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
          patchVideoPlayback(localVideoRef.current)
        }
        // Deferred retry: during layout transitions the ref may be null momentarily
        // (e.g. switching from waiting-room full-size video to PiP)
        setTimeout(() => {
          if (localVideoRef.current && localVideoRef.current.srcObject !== stream) {
            localVideoRef.current.srcObject = stream
            patchVideoPlayback(localVideoRef.current)
          }
        }, 300)
      })
    )

    unsubs.push(
      webrtcClient.on('remote-stream', (stream, remoteUserId) => {
        setHasPeerConnection(true)
        setRemoteUsers((prev) => {
          const updated = new Map(prev)
          const existing = updated.get(remoteUserId) || {
            userId: remoteUserId,
            userType: 'unknown',
            userName: remoteUserId,
          }
          updated.set(remoteUserId, { ...existing, stream })
          return updated
        })
        // Retry stream attachment — the video element may not be mounted yet
        const attachStream = (attempt = 0) => {
          const el = remoteVideosRef.current.get(remoteUserId)
          if (el) {
            if (el.srcObject !== stream) {
              el.srcObject = stream
              patchVideoPlayback(el)

              // Chrome quirk: if stream was assigned while tracks were muted,
              // the video element stays at readyState=0. Re-assign on unmute.
              stream.getTracks().forEach(track => {
                track.addEventListener('unmute', () => {
                  if (el.srcObject === stream && el.readyState === 0) {
                    el.srcObject = null
                    el.srcObject = stream
                    patchVideoPlayback(el)
                  }
                }, { once: true })
              })
            }
          } else if (attempt < 10) {
            setTimeout(() => attachStream(attempt + 1), 100)
          }
        }
        attachStream()
      })
    )

    unsubs.push(
      webrtcClient.on('user-joined', (remoteUserId, remoteUserType) => {
        setRemoteUsers((prev) => {
          const updated = new Map(prev)
          const existing = updated.get(remoteUserId)
          updated.set(remoteUserId, {
            userId: remoteUserId,
            userType: remoteUserType,
            userName: remoteUserId,
            stream: existing?.stream,
          })
          return updated
        })
      })
    )

    unsubs.push(
      webrtcClient.on('user-left', (remoteUserId) => {
        setRemoteUsers((prev) => {
          const updated = new Map(prev)
          updated.delete(remoteUserId)
          if (updated.size === 0) {
            setHasPeerConnection(false)
          }
          return updated
        })
        remoteVideosRef.current.delete(remoteUserId)
        joinSoundPlayedRef.current = false
      })
    )

    unsubs.push(webrtcClient.on('chat-ready', (ready) => setIsChatReady(ready)))

    unsubs.push(
      webrtcClient.on('chat-message', (message) => {
        addRemoteMessage(message)
      })
    )

    unsubs.push(
      webrtcClient.on('stream-quality', (summary) => {
        const connectedForMs =
          connectedAtRef.current === null ? 0 : Date.now() - connectedAtRef.current

        if (connectedForMs < QUALITY_WARMUP_MS || !hasRemoteVideoEvidence(summary)) {
          setQualityLevel('unknown')
          return
        }

        setQualityLevel(summary.overallLevel)
        // Feed auto-degrade service
        autoDegradeRef.current?.update(summary.overallLevel)
      })
    )

    unsubs.push(
      webrtcClient.on('audio-only-fallback', (info) => {
        emitDebug('warn', 'Fallback a audio-only', info)
        setIsVideoEnabled(false)
        setShowAudioOnlySuggestion(false)
      })
    )

    unsubs.push(
      webrtcClient.on('reconnecting', (info) => {
        setReconnectionState({
          isReconnecting: true,
          attempt: info.attempt,
          maxAttempts: info.maxAttempts,
        })
        emitDebug('warn', 'Reconectando la llamada WebRTC', info)
      })
    )

    unsubs.push(
      webrtcClient.on('reconnected', (info) => {
        setReconnectionState((current) => ({
          ...current,
          isReconnecting: false,
        }))
        emitDebug('info', 'Reconexión WebRTC exitosa', info)
      })
    )

    // Observability: lifecycle events persisted to call_events
    unsubs.push(
      webrtcClient.on('media-acquired', (info) => {
        emitDebug('info', 'Media adquirida', info)
        void logCallEvent('media_acquired', info)
      })
    )
    unsubs.push(
      webrtcClient.on('signaling-connected', (info) => {
        emitDebug('info', 'Signaling conectado', info)
        void logCallEvent('signaling_connected', info)
      })
    )
    unsubs.push(
      webrtcClient.on('ice-state-change', (info) => {
        void logCallEvent('ice_state_change', info)
      })
    )
    unsubs.push(
      webrtcClient.on('peer-connected', (info) => {
        emitDebug('info', 'Peer conectado', info)
        setHasPeerConnection(true)
        if (!joinSoundPlayedRef.current) {
          joinSoundPlayedRef.current = true
          void playParticipantJoinedSound()
        }
        void logCallEvent('peer_connected', info)
      })
    )

    unsubs.push(
      webrtcClient.on('error', (error) => {
        logger.error('[UnifiedVideoCall] WebRTC error:', error)
        emitDebug('error', 'Evento de error WebRTC recibido', { error })
        const msg = error instanceof Error ? error.message : 'Error desconocido'
        setCallError(sanitizeErrorForUser(msg))
        onErrorRef.current?.(error)
      })
    )

    setClient(webrtcClient)

    // Pre-warm immediately on mount (Enfoque 1: instant connection)
    setIsWarmingUp(true)
    webrtcClient.warmUp().then((result) => {
      setWarmUpResult(result)
      setAvailableDevices(result.devices)
      setIsWarmingUp(false)
    }).catch(() => {
      setIsWarmingUp(false)
    })

    return () => {
      emitDebug('info', 'Desmontando componente de videollamada')
      unsubs.forEach((u) => u())
      void webrtcClient.disconnect()
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      if (connectingTimerRef.current) clearTimeout(connectingTimerRef.current)
      cleanupSound()
      joinSoundPlayedRef.current = false
    }
  // retryKey causa re-mount del cliente cuando se incrementa (intento de reconexión)
  // Callbacks (onCallStart, onError, onStatusChange) viven en refs para evitar
  // que re-renders del parent destruyan la conexión WebRTC en vuelo.
  }, [addRemoteMessage, autoStart, cleanupSound, cloudflareCallsApiUrl, emitDebug, iceServers, logCallEvent, playParticipantJoinedSound, retryKey, roomId, userId, userName, userType])

  /* ── Duration timer ── */
  useEffect(() => {
    if (!isP2PRuntime || !iceServers || hasTurnIceServer(iceServers)) {
      return
    }

    emitDebug('warn', 'La llamada P2P no tiene TURN configurado; algunas redes estrictas pueden fallar', {
      iceServerCount: iceServers.length,
    })
  }, [emitDebug, iceServers, isP2PRuntime])

  useEffect(() => {
    if (isCallEstablished) {
      connectedAtRef.current ??= Date.now()
    } else {
      connectedAtRef.current = null
      setQualityLevel('unknown')
    }
  }, [isCallEstablished, setQualityLevel])

  useRemoteMediaTimeout({
    isInRoom,
    remoteUsersSize: remoteUsers.size,
    remoteUsersWithMediaCount: remoteUsersWithMedia.length,
    callError,
    setCallError,
    setShowAudioOnlySuggestion,
    emitDebug,
  })

  useCallLifecycleEffects({
    isInRoom,
    isCallEstablished,
    client,
    callId,
    connectionState,
    persistCallStatus,
    hasStartedCallRef,
    manualHangupRef,
    onCallStartRef,
    remoteUsers,
    remoteVideosRef,
    localVideoRef,
    screenShareRef,
    screenStream,
    chatMessagesRef,
    chatMessages,
    isChatPanelOpen,
  })

  /* ── Actions ── */
  const startCall = useCallback(async () => {
    if (!client || connectionState === 'connected' || connectionState === 'connecting') return
    try {
      emitDebug('info', 'Intentando iniciar videollamada', {
        connectionState,
        autoStart,
        preWarmed: !!warmUpResult,
      })
      hasStartedCallRef.current = true
      manualHangupRef.current = false
      setCallError(null)
      if (callId) {
        void persistCallStatus('connecting')
      }
      // If pre-warmed, connect() is near-instant (just sends join message)
      await client.connect(roomId)
      emitDebug('info', 'Conexion al room solicitada')
      setIsVideoEnabled(true)
      setIsAudioEnabled(true)
    } catch (error) {
      emitDebug('error', 'Fallo al iniciar videollamada', { error })
      const msg = error instanceof Error ? error.message : 'Error desconocido'
      setCallError(sanitizeErrorForUser(msg))
    }
  }, [autoStart, callId, client, connectionState, emitDebug, persistCallStatus, roomId, warmUpResult])

  const endCall = useCallback(async () => {
    if (!client) return
    try {
      emitDebug('info', 'Finalizando videollamada manualmente')
      manualHangupRef.current = true
      if (callId) {
        await persistCallStatus('ended', `${userType}_ended`)
      }
      await client.disconnect()
      if (screenStream) {
        screenStream.getTracks().forEach((t) => t.stop())
        setScreenStream(null)
        setIsScreenSharing(false)
      }
      if (recordingState.isRecording) recordingActions.stop()
      onCallEndRef.current?.()
    } catch (error) {
      emitDebug('error', 'Error al finalizar videollamada', { error })
    }
  }, [callId, client, emitDebug, persistCallStatus, screenStream, userType])

  useEffect(() => {
    if (!autoStart || !client || autoStartAttemptedRef.current || connectionState !== 'disconnected') {
      return
    }

    autoStartAttemptedRef.current = true
    emitDebug('info', 'AutoStart habilitado; iniciando llamada automaticamente')
    void startCall()
  }, [autoStart, client, connectionState, emitDebug, startCall])

  const toggleVideo = useCallback(() => {
    if (!client) return
    setIsVideoEnabled(client.toggleVideo())
  }, [client])

  const toggleAudio = useCallback(() => {
    if (!client) return
    setIsAudioEnabled(client.toggleAudio())
  }, [client])

  const toggleRecording = useCallback(() => {
    if (recordingState.isRecording) {
      recordingActions.stop()
      return
    }
    if (!client) return
    const localStream = client.getLocalStream()
    const firstRemote = remoteUsers.values().next().value as RemoteUser | undefined
    recordingActions.start(localStream, firstRemote?.stream ?? null)
  }, [recordingState.isRecording, recordingActions, client, remoteUsers])

  const togglePiP = useCallback(async () => {
    if (typeof document === 'undefined') return
    // Legacy PiP: single remote video element
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture()
      return
    }
    // Find the first remote video or fall back to local
    const remoteEl = remoteVideosRef.current.values().next().value as HTMLVideoElement | undefined
    const target = remoteEl ?? localVideoRef.current
    if (target && document.pictureInPictureEnabled) {
      try {
        await target.requestPictureInPicture()
      } catch { /* user denied or not supported */ }
    }
  }, [])

  const handleDeviceChange = useCallback(async (kind: 'video' | 'audio', deviceId: string) => {
    if (!client) return
    try {
      await client.switchDevice(kind, deviceId)
      if (kind === 'video') setSelectedVideoDevice(deviceId)
      else setSelectedAudioDevice(deviceId)
    } catch (error) {
      emitDebug('warn', 'Device switch failed', { kind, deviceId, error })
    }
  }, [client, emitDebug])

  /* ── Render ── */
  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-neutral-900 text-white ${className}`}
      onMouseMove={isInRoom ? resetControlsTimer : undefined}
    >
      {/* Accessibility: screen reader announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {connectionState === 'connected' && 'Conectado a la consulta'}
        {connectionState === 'connecting' && 'Conectando a la consulta'}
        {connectionState === 'failed' && 'Error de conexión'}
        {remoteUsers.size > 0 && `${remoteUsers.size} participante${remoteUsers.size > 1 ? 's' : ''} en la sala`}
      </div>

      {/* Main video area */}
      <div className="absolute inset-0">
        {/* Green Room */}
        {isIdle && (
          <GreenRoom
            localVideoRef={localVideoRef}
            client={client}
            warmUpResult={warmUpResult}
            isWarmingUp={isWarmingUp}
            audioLevel={audioLevel}
            greenRoomChecks={greenRoomChecks}
            availableDevices={availableDevices}
            selectedVideoDevice={selectedVideoDevice}
            selectedAudioDevice={selectedAudioDevice}
            onDeviceChange={handleDeviceChange}
            onStartCall={startCall}
            callError={callError}
            connectionState={connectionState}
            userName={userName}
            roomId={roomId}
            userType={userType}
            accentColor={accentColor}
            preflightResult={preflightResult}
            preflightRunning={preflightRunning}
            onPreflightRerun={preflightRerun}
          />
        )}

        {/* Connecting / Retrying */}
        {(connectionState === 'connecting' || isRetrying) && (
          <ConnectingOverlay
            isRetrying={isRetrying}
            retryAttempt={retryCountRef.current}
            maxRetries={3}
            accentColor={accentColor}
            roomId={roomId}
          />
        )}

        {isInRoom && (
          <ReconnectingOverlay
            isReconnecting={reconnectionState.isReconnecting}
            attempt={reconnectionState.attempt}
            maxAttempts={reconnectionState.maxAttempts}
          />
        )}

        {/* Active call layout */}
        {isInRoom && (
          <ActiveCallLayout
            remoteUsers={remoteUsers}
            remoteVideosRef={remoteVideosRef}
            localVideoRef={localVideoRef}
            screenShareRef={screenShareRef}
            client={client}
            isVideoEnabled={isVideoEnabled}
            isAudioEnabled={isAudioEnabled}
            isScreenSharing={isScreenSharing}
            screenStream={screenStream}
            userName={userName}
            accentColor={accentColor}
            callError={callError}
          />
        )}
      </div>

      {/* Top bar */}
      {isInRoom && (
        <CallTopBar
          phase={sessionPhase}
          qualityLevel={qualityLevel}
          formattedDuration={formattedDuration}
          participantCount={totalParticipants}
          isRecording={recordingState.isRecording}
          showControls={controlsVisible}
        />
      )}

      {/* Quality overlays (error toast, test badge, audio-only suggestion, quality badge) */}
      {isInRoom && (
        <QualityOverlays
          showAudioOnlySuggestion={showAudioOnlySuggestion}
          onSwitchAudioOnly={() => { switchToAudioOnly(); setIsVideoEnabled(false) }}
          onDismissSuggestion={() => setShowAudioOnlySuggestion(false)}
          callError={callError}
          isTestRoom={isTestRoom}
          showControls={controlsVisible}
          qualityLevel={qualityLevel}
        />
      )}

      {/* Auto-degrade toast */}
      {autoDegradeToast && (
        <div className="absolute left-1/2 top-20 z-50 -translate-x-1/2 rounded-xl border border-white/10 bg-neutral-800/90 px-4 py-3 text-sm text-white shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-top-2">
          {autoDegradeToast}
        </div>
      )}

      {/* Bottom controls */}
      {isInRoom && (
        <CallControlsBar
          isVideoEnabled={isVideoEnabled}
          isAudioEnabled={isAudioEnabled}
          isScreenSharing={isScreenSharing}
          isRecording={recordingState.isRecording}
          isChatPanelOpen={isChatPanelOpen}
          unreadMessages={unreadMessages}
          showControls={controlsVisible}
          userType={userType}
          accentColor={accentColor}
          onToggleVideo={toggleVideo}
          onToggleAudio={toggleAudio}
          onToggleScreenShare={toggleScreenShare}
          onToggleRecording={toggleRecording}
          onToggleChat={toggleChatPanel}
          onTogglePiP={togglePiP}
          onEndCall={endCall}
        />
      )}

      {/* Chat panel */}
      {isInRoom && (
        <ChatPanel
          isOpen={isChatPanelOpen}
          messages={chatMessages}
          chatInput={chatInput}
          onChatInputChange={setChatInput}
          onSubmit={handleChatSubmit}
          onKeyDown={handleChatKeyDown}
          onClose={() => setIsChatPanelOpen(false)}
          chatReady={isChatReady}
          accentColor={accentColor}
          isDesktopViewport={isDesktopViewport}
          chatMessagesRef={chatMessagesRef}
        />
      )}
    </div>
  )
}
