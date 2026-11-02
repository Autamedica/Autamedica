'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { JSX, ReactNode } from 'react'
import { logger } from '@autamedica/shared'
import type { CallService } from './calls/service'
import type { CallStatus } from './calls/types'
import { classifyCallError } from './calls/classify-error'
import { hasTurnIceServer } from './config/ice-servers'
import type { CallProvider, ConnectionState, DeviceInfo, WarmUpResult } from './providers/types'
import type { CallSessionRuntime } from './call-session/types'
import { useCallRecording } from './hooks/useCallRecording'
import { useCallDuration } from './hooks/useCallDuration'
import { useCallQuality } from './hooks/useCallQuality'
import { useAutoHideControls } from './hooks/useAutoHideControls'
import { useGreenRoom } from './hooks/useGreenRoom'
import { sanitizeErrorForUser, messageForFailureCode } from './utils/error-messages'
import { attachQualityTelemetry } from './quality/telemetry'
import { hasRemoteMediaEvidence } from './utils/stream-helpers'
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
  /** Call provider built via createCallProvider(). */
  provider: CallProvider
  roomId: string
  callId?: string
  userId: string
  userType: 'doctor' | 'patient' | 'nurse' | 'guest'
  userName?: string
  /** ICE servers for network preflight test (GreenRoom). */
  iceServers?: RTCIceServer[]
  onCallEnd?: () => void
  onCallStart?: () => void
  onStatusChange?: (status: ConnectionState) => void
  onError?: (error: unknown) => void
  onLocalAudioLevelChange?: (level: number) => void
  persistCallStatus?: (status: CallStatus, reason?: string) => Promise<void>
  callService?: UnifiedVideoCallService
  className?: string
  theme?: 'doctor' | 'patient'
  autoStart?: boolean
  /** Runtime engine shown as badge in CallTopBar. */
  runtime?: CallSessionRuntime
  /** Optional product-specific controls rendered inside the bottom call bar. */
  auxiliaryControls?: ReactNode
}

interface RemoteUser {
  userId: string
  userType: string
  userName?: string
  stream?: MediaStream
}

const QUALITY_WARMUP_MS = 15000

export function UnifiedVideoCall({
  provider,
  roomId,
  callId,
  userId,
  userType,
  userName,
  iceServers,
  onCallEnd,
  onCallStart,
  onStatusChange,
  onError,
  onLocalAudioLevelChange,
  persistCallStatus: persistCallStatusOverride,
  callService: callServiceOverride,
  className = '',
  theme = userType === 'doctor' ? 'doctor' : 'patient',
  autoStart = false,
  runtime,
  auxiliaryControls,
}: UnifiedVideoCallProps): JSX.Element {
  /* ── State ── */
  const [client, setClient] = useState<CallProvider | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [remoteUsers, setRemoteUsers] = useState<Map<string, RemoteUser>>(new Map())
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [callError, setCallError] = useState<string | null>(null)
  const [isChatReady, setIsChatReady] = useState(false)
  const [hasPeerConnection, setHasPeerConnection] = useState(false)
  const [hasRemoteMedia, setHasRemoteMedia] = useState(false)
  /** Peers whose WS/session just dropped but are still within the auto-heal window (10s). */
  const [reconnectingPeers, setReconnectingPeers] = useState<Set<string>>(() => new Set())

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
  const connectStartedAtRef = useRef<number | null>(null)
  const firstRemoteMediaLoggedRef = useRef(false)
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const connectingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const connectionStateRef = useRef<ConnectionState>('disconnected')
  const knownPeerIdsRef = useRef<Set<string>>(new Set())
  const reconnectTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

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
  const { isScreenSharing, setIsScreenSharing, screenStream, setScreenStream, toggleScreenShare } = useScreenShare(client, {
    onError: setCallError,
  })
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
  const isCallEstablished = hasRemoteMedia
  const sessionPhase = deriveCallSessionPhase({ connectionState, hasPeerConnection, hasRemoteMedia })
  const isInRoom =
    sessionPhase === 'room-ready' ||
    sessionPhase === 'peer-ready' ||
    sessionPhase === 'media-live'
  const isIdle = sessionPhase === 'prejoin'
  const isTestRoom = /^test(?:[-_]|$)/i.test(roomId)
  const hasTurn = useMemo(() => hasTurnIceServer(iceServers ?? []), [iceServers])
  const remoteUsersWithMedia = useMemo(
    () => Array.from(remoteUsers.values()).filter((user) => user.stream),
    [remoteUsers]
  )
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

  /* ── Preflight recommendation only — do not auto-disable camera ── */
  useEffect(() => {
    if (preflightResult?.recommendation === 'audio-only' && isIdle) {
      emitDebug('warn', 'Preflight recomienda audio-only, pero mantenemos video habilitado por defecto', {
        recommendation: preflightResult.recommendation,
      })
    }
  }, [emitDebug, isIdle, preflightResult])

  /* ── WebRTC setup ── */
  useEffect(() => {
    syncChatPanelRef(isChatPanelOpen)
  }, [isChatPanelOpen, syncChatPanelRef])

  useEffect(() => {
    emitDebug('info', 'Inicializando componente de videollamada', {
      runtime: runtime ?? 'unknown',
      providerType: provider.constructor?.name ?? 'UnknownProvider',
      hasTurn,
      iceServerCount: iceServers?.length ?? 0,
      sessionPhase,
      autoStart,
      userName,
    })

    const webrtcClient = provider
    const unsubs: Array<() => void> = []
    unsubs.push(attachQualityTelemetry(webrtcClient, logCallEvent, runtime === 'cloudflare-calls' ? 'client_to_sfu' : 'peer_to_peer'))
    const startConnectingTimeout = () => {
      if (connectingTimerRef.current) {
        clearTimeout(connectingTimerRef.current)
      }
      const CONNECTING_TIMEOUT_MS = 45_000
      connectingTimerRef.current = setTimeout(() => {
        connectingTimerRef.current = null
        emitDebug('warn', 'Conexion colgada en "connecting" con peer presente por 45s — forzando reintento')
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
    }

    unsubs.push(
      webrtcClient.on('connection-state', (state) => {
        connectionStateRef.current = state
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
          if (knownPeerIdsRef.current.size > 0) {
            startConnectingTimeout()
          } else {
            emitDebug('info', 'Esperando al otro participante; omitimos timeout agresivo de conexión')
          }
        } else if (state === 'connected') {
          retryCountRef.current = 0
          setIsRetrying(false)
          setCallError(null)
          setReconnectionState({ isReconnecting: false, attempt: 0, maxAttempts: 0 })
        } else if (state === 'disconnected' || state === 'closed') {
          setIsChatReady(false)
          setHasPeerConnection(false)
          setHasRemoteMedia(false)
          setReconnectionState({ isReconnecting: false, attempt: 0, maxAttempts: 0 })
        }
      })
    )

    unsubs.push(
      webrtcClient.on('local-stream', (stream: MediaStream) => {
        setLocalStream(stream)
      })
    )

    unsubs.push(
      webrtcClient.on('remote-stream', (stream, remoteUserId) => {
        setHasPeerConnection(true)

        // Detect when media is actually flowing (not just signaling connected)
        const markMediaLive = () => {
          setHasRemoteMedia(true)
          if (!firstRemoteMediaLoggedRef.current && connectStartedAtRef.current) {
            firstRemoteMediaLoggedRef.current = true
            const hasVideo = stream.getVideoTracks().some(t => t.readyState === 'live')
            const hasAudio = stream.getAudioTracks().some(t => t.readyState === 'live')
            const elapsedMs = Date.now() - connectStartedAtRef.current
            void logCallEvent('first_remote_media', {
              timeToFirstRemoteMediaMs: elapsedMs,
              hasVideo,
              hasAudio,
              runtime,
            })
            void logCallEvent('join_succeeded', { runtime, elapsedMs })
          }
        }

        const hasLiveTracks = stream.getTracks().some(t => t.readyState === 'live' && !t.muted)
        if (hasLiveTracks) {
          markMediaLive()
        } else {
          const onUnmute = () => {
            markMediaLive()
            stream.getTracks().forEach(t => t.removeEventListener('unmute', onUnmute))
          }
          stream.getTracks().forEach(t => t.addEventListener('unmute', onUnmute))
        }

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
      })
    )

    unsubs.push(
      webrtcClient.on('user-joined', (remoteUserId, remoteUserType) => {
        knownPeerIdsRef.current.add(remoteUserId)
        // Peer is back — cancel the reconnect grace window.
        const pendingTimer = reconnectTimersRef.current.get(remoteUserId)
        if (pendingTimer) {
          clearTimeout(pendingTimer)
          reconnectTimersRef.current.delete(remoteUserId)
        }
        setReconnectingPeers((prev) => {
          if (!prev.has(remoteUserId)) return prev
          const next = new Set(prev)
          next.delete(remoteUserId)
          return next
        })
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
        if (connectionStateRef.current === 'connecting' && !connectingTimerRef.current) {
          startConnectingTimeout()
        }
      })
    )

    unsubs.push(
      webrtcClient.on('user-left', (remoteUserId) => {
        knownPeerIdsRef.current.delete(remoteUserId)
        // Flag this peer as reconnecting for 10s. If a user-joined arrives
        // during that window (auto-heal from PR #326), the UI shows a
        // "Reconectando..." state instead of "Esperando al participante..." —
        // the peer didn't truly leave, they just refreshed the SFU session.
        setReconnectingPeers((prev) => {
          const next = new Set(prev)
          next.add(remoteUserId)
          return next
        })
        const existingTimer = reconnectTimersRef.current.get(remoteUserId)
        if (existingTimer) clearTimeout(existingTimer)
        const timer = setTimeout(() => {
          setReconnectingPeers((prev) => {
            if (!prev.has(remoteUserId)) return prev
            const next = new Set(prev)
            next.delete(remoteUserId)
            return next
          })
          reconnectTimersRef.current.delete(remoteUserId)
        }, 10_000)
        reconnectTimersRef.current.set(remoteUserId, timer)

        setRemoteUsers((prev) => {
          const updated = new Map(prev)
          updated.delete(remoteUserId)
          if (updated.size === 0) {
            setHasPeerConnection(false)
            setHasRemoteMedia(false)
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

        if (connectedForMs < QUALITY_WARMUP_MS || !hasRemoteMediaEvidence(summary)) {
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
        const failureCode = classifyCallError(error)
        emitDebug('error', 'Evento de error WebRTC recibido', { error, failureCode })
        void logCallEvent('call_error', { failureCode, message: error instanceof Error ? error.message : String(error) })
        setCallError(messageForFailureCode(failureCode))
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
      void webrtcClient.disconnect()
      unsubs.forEach((u) => u())
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      if (connectingTimerRef.current) clearTimeout(connectingTimerRef.current)
      cleanupSound()
      joinSoundPlayedRef.current = false
    }
  // retryKey causa re-mount del cliente cuando se incrementa (intento de reconexión)
  // Callbacks (onCallStart, onError, onStatusChange) viven en refs para evitar
  // que re-renders del parent destruyan la conexión WebRTC en vuelo.
  }, [autoStart, provider, retryKey, roomId, userId, runtime]) // Stable: only restart on hard identity/provider/retry changes

  /* ── Duration timer ── */
  useEffect(() => {
    if (runtime !== 'webrtc-p2p' || !iceServers || hasTurnIceServer(iceServers)) {
      return
    }

    emitDebug('warn', 'La llamada P2P no tiene TURN configurado; algunas redes estrictas pueden fallar', {
      iceServerCount: iceServers.length,
    })
  }, [emitDebug, iceServers, runtime])

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
    localStream,
    screenShareRef,
    screenStream,
    chatMessagesRef,
    chatMessages,
    isChatPanelOpen,
  })

  useEffect(() => {
    onLocalAudioLevelChange?.(0)

    if (!onLocalAudioLevelChange || !client || !isInRoom) {
      return
    }

    const localStream = client.getLocalStream()
    const audioTrack = localStream?.getAudioTracks()[0]
    if (!audioTrack) {
      return
    }

    let audioContext: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let frameId: number | null = null

    try {
      audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]))
      analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.3
      source.connect(analyser)

      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        if (!analyser) return
        analyser.getByteFrequencyData(dataArray)
        let sum = 0
        for (let index = 0; index < dataArray.length; index += 1) {
          sum += dataArray[index]
        }

        const avg = sum / dataArray.length
        const nextLevel = audioTrack.enabled ? Math.min(avg / 128, 1) : 0
        onLocalAudioLevelChange(nextLevel)
        frameId = requestAnimationFrame(tick)
      }

      tick()
    } catch {
      onLocalAudioLevelChange(0)
    }

    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId)
      if (audioContext?.state !== 'closed') {
        void audioContext?.close()
      }
      onLocalAudioLevelChange(0)
    }
  }, [client, isAudioEnabled, isInRoom, onLocalAudioLevelChange, retryKey])

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
      connectStartedAtRef.current = Date.now()
      firstRemoteMediaLoggedRef.current = false
      if (callId) {
        void persistCallStatus('connecting')
      }
      // If pre-warmed, connect() is near-instant (just sends join message)
      await client.connect(roomId)
      emitDebug('info', 'Conexion al room solicitada')
      setIsVideoEnabled(true)
      setIsAudioEnabled(true)
    } catch (error) {
      const failureCode = classifyCallError(error)
      emitDebug('error', 'Fallo al iniciar videollamada', { error, failureCode })
      void logCallEvent('join_failed', { failureCode, message: error instanceof Error ? error.message : String(error) })
      const msg = error instanceof Error ? error.message : 'Error desconocido'
      setCallError(sanitizeErrorForUser(msg))
    }
  }, [autoStart, callId, client, connectionState, emitDebug, logCallEvent, persistCallStatus, roomId, warmUpResult])

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
    if ('setCameraEnabled' in client && typeof client.setCameraEnabled === 'function') {
      const next = !isVideoEnabled
      setIsVideoEnabled(next)
      void client.setCameraEnabled(next).then((confirmed) => {
        setIsVideoEnabled(confirmed)
      }).catch(() => {
        setIsVideoEnabled(isVideoEnabled)
      })
      return
    }
    setIsVideoEnabled(client.toggleVideo())
  }, [client, isVideoEnabled])

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
    try {
      // Exit PiP if already active
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
        return
      }
      // Find the first remote video or fall back to local
      const remoteEl = remoteVideosRef.current.values().next().value as HTMLVideoElement | undefined
      const target = remoteEl ?? localVideoRef.current
      if (!target) return

      // Check PiP support: document-level API (Chrome/Edge) or element-level (Safari/iOS)
      const pipSupported =
        ('pictureInPictureEnabled' in document && document.pictureInPictureEnabled) ||
        ('webkitSupportsPresentationMode' in target &&
          typeof (target as HTMLVideoElement & { webkitSupportsPresentationMode?: (mode: string) => boolean }).webkitSupportsPresentationMode === 'function' &&
          (target as HTMLVideoElement & { webkitSupportsPresentationMode: (mode: string) => boolean }).webkitSupportsPresentationMode('picture-in-picture'))

      if (!pipSupported) return

      // Safari/iOS uses webkit API
      if ('webkitSetPresentationMode' in target) {
        (target as HTMLVideoElement & { webkitSetPresentationMode: (mode: string) => void }).webkitSetPresentationMode('picture-in-picture')
      } else {
        await target.requestPictureInPicture()
      }
    } catch {
      // PiP denied by user or not supported on this platform
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
      className={`relative h-full w-full overflow-hidden bg-am-surface-900 text-white ${className}`}
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
            reconnectingPeers={reconnectingPeers}
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
          runtime={runtime}
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
          auxiliaryActions={auxiliaryControls}
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

