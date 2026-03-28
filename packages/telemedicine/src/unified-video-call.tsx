'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { FormEvent, JSX, KeyboardEvent } from 'react'
import { logger } from '@autamedica/shared'
import {
  acquireWakeLock,
  releaseWakeLock,
  setupWakeLockVisibilityHandler,
  setupVisibilityVideoPause,
  applyScreenShareHint,
  patchVideoPlayback,
} from './media-optimizations'
import { createCallService } from './calls/service'
import type { CallService } from './calls/service'
import type { CallStatus } from './calls/types'
import { hasTurnIceServer } from './config/ice-servers'
import { createTelemedicineLogger, type TelemedicineDebugLevel } from './debug'
import {
  WebRTCClient,
  type ChatMessage,
  type ConnectionState,
  type DeviceInfo,
  type StreamQualityLevel,
  type StreamQualitySummary,
  type WarmUpResult,
} from './webrtc-client'
import { CloudflareCallsClient } from './cloudflare-calls'
import { useCallRecording } from './hooks/useCallRecording'
import { deriveCallSessionPhase } from './runtime/call-session-phase'
import {
  GreenRoom,
  ConnectingOverlay,
  ActiveCallLayout,
  CallTopBar,
  CallControlsBar,
  ChatPanel,
  QualityOverlays,
} from './components'

type UnifiedVideoCallService = Pick<CallService, 'updateCallStatus' | 'logDebugEvent' | 'logEvent'>

/* ── Props ── */

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

/* ── Internal types ── */

interface RemoteUser {
  userId: string
  userType: string
  userName?: string
  stream?: MediaStream
}

interface UiChatMessage extends ChatMessage {
  mine: boolean
  senderLabel: string
}

/* ── Helpers ── */

function sanitizeErrorForUser(raw: string): string {
  const lower = raw.toLowerCase()
  if (lower.includes('permission') || lower.includes('notallowed') || lower.includes('not allowed'))
    return 'Necesitamos acceso a tu cámara y micrófono. Revisá los permisos del navegador.'
  if (lower.includes('notfound') || lower.includes('not found') || lower.includes('no device'))
    return 'No se encontró cámara o micrófono. Verificá que estén conectados.'
  if (lower.includes('signaling') || lower.includes('websocket'))
    return 'No pudimos conectar con el servidor. Recargá la página para reintentar.'
  if (lower.includes('icecandidate') || lower.includes('ice candidate') || lower.includes('ice failed') || lower.includes('stun') || lower.includes('relay'))
    return 'Problema de red. Verificá tu conexión a internet.'
  if (lower.includes('timeout') || lower.includes('timed out'))
    return 'La conexión tardó demasiado. Intentá de nuevo.'
  return 'Ocurrió un error. Recargá la página para reintentar.'
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}


const QUALITY_WARMUP_MS = 15000
const POOR_QUALITY_THRESHOLD_MS = 30_000 // Suggest audio-only after 30s of poor quality
const REMOTE_MEDIA_TIMEOUT_MS = 20_000
const REMOTE_MEDIA_TIMEOUT_MESSAGE = 'El video del otro participante está demorando. Podés continuar solo con audio.'

function hasRemoteVideoEvidence(summary: StreamQualitySummary): boolean {
  return summary.peers.some((peer) => {
    const inboundVideo = peer.inboundVideoBitrateKbps ?? 0
    const fps = peer.framesPerSecond ?? 0
    const width = peer.frameWidth ?? 0
    const height = peer.frameHeight ?? 0

    return inboundVideo >= 150 || fps >= 8 || (width >= 160 && height >= 120)
  })
}

/* ── Component ── */

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
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [remoteUsers, setRemoteUsers] = useState<Map<string, RemoteUser>>(new Map())
  const [callError, setCallError] = useState<string | null>(null)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [isChatReady, setIsChatReady] = useState(false)
  const [isChatPanelOpen, setIsChatPanelOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<UiChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [connectedAt, setConnectedAt] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [qualityLevel, setQualityLevel] = useState<StreamQualityLevel>('unknown')
  const [controlsVisible, setControlsVisible] = useState(true)
  const [hasPeerConnection, setHasPeerConnection] = useState(false)
  // Iniciar siempre con `true` en SSR y en cliente para evitar mismatch de hidratación.
  // El efecto de resize lo corrige en el primer render del cliente.
  const [isDesktopViewport, setIsDesktopViewport] = useState<boolean>(true)

  /* ── Retry state ── */
  const [retryKey, setRetryKey] = useState(0)
  const [isRetrying, setIsRetrying] = useState(false)

  /* ── Refs ── */
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map())
  const screenShareRef = useRef<HTMLVideoElement>(null)
  const chatMessagesRef = useRef<HTMLDivElement>(null)
  const chatPanelOpenRef = useRef(false)
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callServiceRef = useRef<UnifiedVideoCallService | null>(null)
  const joinSoundContextRef = useRef<AudioContext | null>(null)
  const joinSoundPlayedRef = useRef(false)
  const lastPersistedCallStatusRef = useRef<CallStatus | null>(null)
  const hasStartedCallRef = useRef(false)
  const autoStartAttemptedRef = useRef(false)
  const manualHangupRef = useRef(false)
  const connectedAtRef = useRef<number | null>(null)
  const poorQualityStartRef = useRef<number | null>(null)
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasAnnouncedCallStartRef = useRef(false)
  const remoteMediaWaitStartedAtRef = useRef<number | null>(null)
  const remoteMediaTimeoutHandledRef = useRef(false)

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

  /* ── Green Room state ── */
  const [warmUpResult, setWarmUpResult] = useState<WarmUpResult | null>(null)
  const [isWarmingUp, setIsWarmingUp] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [availableDevices, setAvailableDevices] = useState<DeviceInfo[]>([])
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>('')
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>('')
  const [showAudioOnlySuggestion, setShowAudioOnlySuggestion] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioAnalyserRef = useRef<AnalyserNode | null>(null)
  const audioAnimFrameRef = useRef<number | null>(null)

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
  const debugLogger = useMemo(
    () => createTelemedicineLogger({ source: 'UnifiedVideoCall', callId, roomId, userId, userType }),
    [callId, roomId, userId, userType]
  )

  /* ── Controls auto-hide ── */
  const resetControlsTimer = useCallback(() => {
    setControlsVisible(true)
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 5000)
  }, [])

  const playParticipantJoinedSound = useCallback(async () => {
    if (typeof window === 'undefined') {
      return
    }

    const AudioContextCtor = window.AudioContext
      ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

    if (!AudioContextCtor) {
      return
    }

    try {
      let ctx = joinSoundContextRef.current

      if (!ctx || ctx.state === 'closed') {
        ctx = new AudioContextCtor()
        joinSoundContextRef.current = ctx
      }

      if (ctx.state === 'suspended') {
        await ctx.resume()
      }

      const activeContext = ctx
      const startAt = ctx.currentTime + 0.02
      const master = activeContext.createGain()
      master.gain.setValueAtTime(0.0001, startAt)
      master.gain.exponentialRampToValueAtTime(0.08, startAt + 0.02)
      master.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.42)
      master.connect(activeContext.destination)

      const notes = [
        { frequency: 880, offset: 0 },
        { frequency: 1174.66, offset: 0.16 },
      ]

      notes.forEach(({ frequency, offset }) => {
        const noteStart = startAt + offset
        const oscillator = activeContext.createOscillator()
        const gain = activeContext.createGain()

        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(frequency, noteStart)
        gain.gain.setValueAtTime(0.0001, noteStart)
        gain.gain.exponentialRampToValueAtTime(0.18, noteStart + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.16)

        oscillator.connect(gain)
        gain.connect(master)
        oscillator.start(noteStart)
        oscillator.stop(noteStart + 0.2)
      })
    } catch {
      // Best-effort UX cue: audio restrictions must not break the call.
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleResize = () => setIsDesktopViewport(window.innerWidth >= 768)
    handleResize()
    window.addEventListener('resize', handleResize)

    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!isInRoom) {
      setControlsVisible(true)
      return
    }
    resetControlsTimer()
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    }
  }, [isInRoom, resetControlsTimer])

  const persistCallStatus = useCallback(
    async (status: CallStatus, reason?: string) => {
      if (!callId) {
        return
      }

      if (lastPersistedCallStatusRef.current === status && !reason) {
        return
      }

      try {
        if (persistCallStatusOverride) {
          await persistCallStatusOverride(status, reason)
        } else {
          const callService = callServiceOverride
            ?? callServiceRef.current
            ?? createCallService()
          callServiceRef.current = callService
          await callService.updateCallStatus(callId, status, reason)
        }
        lastPersistedCallStatusRef.current = status
      } catch (error) {
        logger.warn('[UnifiedVideoCall] Failed to persist call status', {
          callId,
          status,
          error,
        })
      }
    },
    [callId, callServiceOverride, persistCallStatusOverride]
  )

  const emitDebug = useCallback(
    (level: TelemedicineDebugLevel, message: string, payload?: Record<string, unknown>) => {
      switch (level) {
        case 'error':
          debugLogger.error(message, undefined, payload)
          break
        case 'warn':
          debugLogger.warn(message, payload)
          break
        default:
          debugLogger.info(message, payload)
          break
      }

      if (!callId) {
        return
      }

      try {
        const callService = callServiceOverride ?? callServiceRef.current
        if (!callService) {
          return
        }

        callServiceRef.current = callService
        void callService.logDebugEvent(callId, level, 'UnifiedVideoCall', message, {
          roomId,
          userId,
          userType,
          ...payload,
        })
      } catch (error) {
        debugLogger.warn('No fue posible preparar persistencia de debug_log', {
          callId,
          roomId,
          error,
        })
      }
    },
    [callId, callServiceOverride, debugLogger, roomId, userId, userType]
  )

  const logCallEvent = useCallback(
    async (type: string, payload?: Record<string, unknown>) => {
      if (!callId) return
      try {
        const callService = callServiceOverride ?? callServiceRef.current
        if (!callService) {
          return
        }

        callServiceRef.current = callService
        await callService.logEvent(callId, type, (payload ?? null) as import('@autamedica/types').Json)
      } catch {
        // non-critical: don't block the call flow
      }
    },
    [callId, callServiceOverride]
  )

  /* ── WebRTC setup ── */
  useEffect(() => {
    chatPanelOpenRef.current = isChatPanelOpen
  }, [isChatPanelOpen])

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
        if (state === 'failed') {
          const MAX_RETRIES = 3
          const attempt = retryCountRef.current
          if (!manualHangupRef.current && autoStart && attempt < MAX_RETRIES) {
            const delayMs = (attempt + 1) * 2000 // 2s, 4s, 6s
            retryCountRef.current += 1
            setIsRetrying(true)
            setCallError(null)
            emitDebug('warn', `Conexion fallida — reintentando (${retryCountRef.current}/${MAX_RETRIES}) en ${delayMs}ms`)
            retryTimerRef.current = setTimeout(() => {
              autoStartAttemptedRef.current = false
              hasStartedCallRef.current = false
              setRetryKey((k) => k + 1)
            }, delayMs)
          } else {
            setIsRetrying(false)
            setCallError('Error de conexión. Verifica tu internet y recarga la página.')
          }
        } else if (state === 'connected') {
          retryCountRef.current = 0
          setIsRetrying(false)
          setCallError(null)
        } else if (state === 'disconnected' || state === 'closed') {
          setIsChatReady(false)
          setHasPeerConnection(false)
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
        setChatMessages((prev) => [
          ...prev,
          { ...message, mine: false, senderLabel: message.senderName || message.senderId },
        ])
        if (!chatPanelOpenRef.current) setUnreadMessages((prev) => prev + 1)
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
      })
    )

    unsubs.push(
      webrtcClient.on('audio-only-fallback', (info) => {
        emitDebug('warn', 'Fallback a audio-only', info)
        setIsVideoEnabled(false)
        setShowAudioOnlySuggestion(false)
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
      // Clean up audio monitoring
      if (audioAnimFrameRef.current) cancelAnimationFrame(audioAnimFrameRef.current)
      if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close()
      if (joinSoundContextRef.current?.state !== 'closed') joinSoundContextRef.current?.close()
      joinSoundContextRef.current = null
      joinSoundPlayedRef.current = false
    }
  // retryKey causa re-mount del cliente cuando se incrementa (intento de reconexión)
  // Callbacks (onCallStart, onError, onStatusChange) viven en refs para evitar
  // que re-renders del parent destruyan la conexión WebRTC en vuelo.
  }, [autoStart, cloudflareCallsApiUrl, emitDebug, iceServers, logCallEvent, playParticipantJoinedSound, retryKey, roomId, userId, userName, userType])

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
      setConnectedAt((prev) => prev ?? Date.now())
      connectedAtRef.current ??= Date.now()
    } else {
      setConnectedAt(null)
      setElapsedSeconds(0)
      connectedAtRef.current = null
      setQualityLevel('unknown')
    }
  }, [isCallEstablished])

  useEffect(() => {
    if (connectedAt === null) return
    const tick = () => setElapsedSeconds(Math.floor((Date.now() - connectedAt) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [connectedAt])

  useEffect(() => {
    if (!isInRoom || remoteUsers.size === 0 || remoteUsersWithMedia.length > 0) {
      remoteMediaWaitStartedAtRef.current = null
      remoteMediaTimeoutHandledRef.current = false
      if (callError === REMOTE_MEDIA_TIMEOUT_MESSAGE) {
        setCallError(null)
      }
      return
    }

    if (remoteMediaTimeoutHandledRef.current) {
      return
    }

    if (remoteMediaWaitStartedAtRef.current === null) {
      remoteMediaWaitStartedAtRef.current = Date.now()
    }

    const elapsedMs = Date.now() - remoteMediaWaitStartedAtRef.current
    const remainingMs = Math.max(0, REMOTE_MEDIA_TIMEOUT_MS - elapsedMs)

    if (remainingMs === 0) {
      remoteMediaTimeoutHandledRef.current = true
      setShowAudioOnlySuggestion(true)
      setCallError((current) => current ?? REMOTE_MEDIA_TIMEOUT_MESSAGE)
      emitDebug('warn', 'El peer entro a la sala pero el video remoto no estuvo listo a tiempo', {
        remoteUsers: remoteUsers.size,
        timeoutMs: REMOTE_MEDIA_TIMEOUT_MS,
      })
      return
    }

    const timer = window.setTimeout(() => {
      remoteMediaTimeoutHandledRef.current = true
      setShowAudioOnlySuggestion(true)
      setCallError((current) => current ?? REMOTE_MEDIA_TIMEOUT_MESSAGE)
      emitDebug('warn', 'El peer entro a la sala pero el video remoto no estuvo listo a tiempo', {
        remoteUsers: remoteUsers.size,
        timeoutMs: REMOTE_MEDIA_TIMEOUT_MS,
      })
    }, remainingMs)

    return () => window.clearTimeout(timer)
  }, [callError, emitDebug, isInRoom, remoteUsers, remoteUsersWithMedia.length])

  useEffect(() => {
    if (isCallEstablished && !hasAnnouncedCallStartRef.current) {
      hasAnnouncedCallStartRef.current = true
      onCallStartRef.current?.()
      return
    }

    if (!isCallEstablished) {
      hasAnnouncedCallStartRef.current = false
    }
  }, [isCallEstablished])

  /* ── Wake Lock: keep screen on during active call ── */
  useEffect(() => {
    if (!isInRoom) return
    void acquireWakeLock()
    const cleanup = setupWakeLockVisibilityHandler()
    return () => {
      cleanup()
      void releaseWakeLock()
    }
  }, [isInRoom])

  /* ── Pause video when tab hidden (save CPU/battery) ── */
  useEffect(() => {
    if (!isInRoom || !client) return
    return setupVisibilityVideoPause(() => client.getLocalStream())
  }, [isInRoom, client])

  useEffect(() => {
    if (!callId || !hasStartedCallRef.current) {
      return
    }

    if (connectionState === 'connecting') {
      void persistCallStatus('connecting')
      return
    }

    if (connectionState === 'connected' && isCallEstablished) {
      void persistCallStatus('connected')
      return
    }

    if ((connectionState === 'closed' || connectionState === 'failed') && !manualHangupRef.current) {
      void persistCallStatus('ended', 'connection_closed')
    }
  }, [callId, connectionState, isCallEstablished, persistCallStatus])

  /* ── Stream sync effects ── */
  useEffect(() => {
    remoteUsers.forEach((user, uid) => {
      if (!user.stream) return
      const el = remoteVideosRef.current.get(uid)
      if (el && el.srcObject !== user.stream) {
        el.srcObject = user.stream
        patchVideoPlayback(el)
      }
    })
  }, [remoteUsers])

  // Re-attach local stream when layout changes (waiting → PiP transition)
  useEffect(() => {
    if (!client || !localVideoRef.current) return
    const stream = client.getLocalStream()
    if (stream && localVideoRef.current.srcObject !== stream) {
      localVideoRef.current.srcObject = stream
      patchVideoPlayback(localVideoRef.current)
    }
  }, [client, remoteUsers])

  useEffect(() => {
    if (screenShareRef.current && screenStream) screenShareRef.current.srcObject = screenStream
  }, [screenStream])

  useEffect(() => {
    if (chatMessagesRef.current) chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight
  }, [chatMessages, isChatPanelOpen])

  const formattedDuration = useMemo(() => formatDuration(elapsedSeconds), [elapsedSeconds])

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

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      screenStream?.getTracks().forEach((t) => t.stop())
      setScreenStream(null)
      setIsScreenSharing(false)
      // Restore camera track in WebRTC connection
      if (client && 'replaceVideoTrack' in client) {
        await (client as { replaceVideoTrack: (t: MediaStreamTrack | null) => Promise<void> }).replaceVideoTrack(null)
      }
      return
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      applyScreenShareHint(stream)
      setScreenStream(stream)
      setIsScreenSharing(true)
      // Send screen share track to remote peers
      const screenTrack = stream.getVideoTracks()[0]
      if (screenTrack && client && 'replaceVideoTrack' in client) {
        await (client as { replaceVideoTrack: (t: MediaStreamTrack | null) => Promise<void> }).replaceVideoTrack(screenTrack)
      }
      screenTrack?.addEventListener('ended', async () => {
        setScreenStream(null)
        setIsScreenSharing(false)
        if (client && 'replaceVideoTrack' in client) {
          await (client as { replaceVideoTrack: (t: MediaStreamTrack | null) => Promise<void> }).replaceVideoTrack(null)
        }
      })
    } catch {
      setIsScreenSharing(false)
    }
  }, [isScreenSharing, screenStream, client])

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

  const toggleChatPanel = useCallback(() => {
    setIsChatPanelOpen((prev) => {
      if (!prev) setUnreadMessages(0)
      return !prev
    })
  }, [])

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

  const sendChat = useCallback(() => {
    if (!client) return
    const text = chatInput.trim()
    if (!text) return

    if (!client.sendChatMessage(text)) {
      emitDebug('warn', 'Envio de chat rechazado porque el canal no esta listo')
      setCallError('Chat aún no listo. Espera la conexión del otro participante.')
      return
    }

    setChatMessages((prev) => [
      ...prev,
      {
        id: `${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        senderId: userId,
        senderType: userType,
        senderName: userName,
        senderLabel: 'Tú',
        timestamp: Date.now(),
        mine: true,
      },
    ])
    setChatInput('')
    setCallError(null)
    emitDebug('info', 'Mensaje de chat enviado', { length: text.length })
  }, [chatInput, client, emitDebug, userId, userName, userType])

  const handleChatSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      sendChat()
    },
    [sendChat]
  )

  const handleChatKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendChat()
      }
    },
    [sendChat]
  )

  /* ── Audio VU Meter for Green Room ── */
  useEffect(() => {
    if (!warmUpResult?.stream || isInRoom) return

    const audioTrack = warmUpResult.stream.getAudioTracks()[0]
    if (!audioTrack) return

    try {
      const ctx = new AudioContext()
      audioContextRef.current = ctx
      const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]))
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.3
      source.connect(analyser)
      audioAnalyserRef.current = analyser

      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      const tick = () => {
        analyser.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
        const avg = sum / dataArray.length
        setAudioLevel(Math.min(avg / 128, 1)) // normalize 0-1
        audioAnimFrameRef.current = requestAnimationFrame(tick)
      }
      tick()
    } catch {
      // AudioContext not supported — ignore
    }

    return () => {
      if (audioAnimFrameRef.current) cancelAnimationFrame(audioAnimFrameRef.current)
      if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close()
      audioContextRef.current = null
    }
  }, [isInRoom, warmUpResult])

  /* ── Audio-only suggestion when quality is persistently poor ── */
  useEffect(() => {
    if (qualityLevel === 'poor') {
      if (!poorQualityStartRef.current) {
        poorQualityStartRef.current = Date.now()
      } else if (Date.now() - poorQualityStartRef.current >= POOR_QUALITY_THRESHOLD_MS) {
        setShowAudioOnlySuggestion(true)
      }
    } else {
      poorQualityStartRef.current = null
      setShowAudioOnlySuggestion(false)
    }
  }, [qualityLevel])

  const switchToAudioOnly = useCallback(() => {
    if (!client) return
    client.toggleVideo(false)
    setIsVideoEnabled(false)
    setShowAudioOnlySuggestion(false)
    if (callError === REMOTE_MEDIA_TIMEOUT_MESSAGE) {
      setCallError(null)
    }
    emitDebug('info', 'Switched to audio-only mode due to poor connection')
  }, [callError, client, emitDebug])

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

  /* ── Green Room readiness checks ── */
  const greenRoomChecks = useMemo(() => {
    const hasVideo = warmUpResult?.stream?.getVideoTracks()?.[0]?.readyState === 'live'
    const hasAudio = warmUpResult?.stream?.getAudioTracks()?.[0]?.readyState === 'live'
    const hasSignaling = warmUpResult?.signalingReady ?? false
    const allReady = hasVideo && hasAudio && hasSignaling
    return { hasVideo, hasAudio, hasSignaling, allReady }
  }, [warmUpResult])

  /* ── Render ── */
  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-neutral-900 text-white ${className}`}
      onMouseMove={isInRoom ? resetControlsTimer : undefined}
    >
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
          onSwitchAudioOnly={switchToAudioOnly}
          onDismissSuggestion={() => setShowAudioOnlySuggestion(false)}
          callError={callError}
          isTestRoom={isTestRoom}
          showControls={controlsVisible}
          qualityLevel={qualityLevel}
        />
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
