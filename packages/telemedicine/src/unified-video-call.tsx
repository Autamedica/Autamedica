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
} from './media-optimizations'
import { createCallService } from './calls/service'
import type { CallStatus } from './calls/types'
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
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  Phone,
  Users,
  ScreenShare,
  ScreenShareOff,
  Loader2,
  MessageSquare,
  Send,
  X,
  Wifi,
  WifiOff,
  Clock,
  UserCircle,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Volume2,
  PictureInPicture2,
} from 'lucide-react'

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

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

const qualityColor: Record<StreamQualityLevel, string> = {
  excellent: 'text-emerald-400',
  good: 'text-emerald-400',
  fair: 'text-amber-400',
  poor: 'text-red-400',
  unknown: 'text-slate-400',
}

const qualityLabel: Record<StreamQualityLevel, string> = {
  excellent: 'Excelente',
  good: 'Buena',
  fair: 'Regular',
  poor: 'Mala',
  unknown: '',
}

const QUALITY_WARMUP_MS = 15000
const POOR_QUALITY_THRESHOLD_MS = 30_000 // Suggest audio-only after 30s of poor quality

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
  const callServiceRef = useRef<ReturnType<typeof createCallService> | null>(null)
  const lastPersistedCallStatusRef = useRef<CallStatus | null>(null)
  const hasStartedCallRef = useRef(false)
  const autoStartAttemptedRef = useRef(false)
  const manualHangupRef = useRef(false)
  const connectedAtRef = useRef<number | null>(null)
  const poorQualityStartRef = useRef<number | null>(null)
  const retryCountRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ── Callback refs (prevent useEffect re-runs when parent re-renders) ── */
  const onCallStartRef = useRef(onCallStart)
  const onCallEndRef = useRef(onCallEnd)
  const onStatusChangeRef = useRef(onStatusChange)
  const onErrorRef = useRef(onError)
  onCallStartRef.current = onCallStart
  onCallEndRef.current = onCallEnd
  onStatusChangeRef.current = onStatusChange
  onErrorRef.current = onError

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
  const isActive = connectionState === 'connected'
  const isIdle = connectionState === 'disconnected' || connectionState === 'failed'
  const firstRemote = remoteUsers.size > 0 ? Array.from(remoteUsers.entries())[0] : null
  const isTestRoom = /^test(?:[-_]|$)/i.test(roomId)
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
    if (!isActive) {
      setControlsVisible(true)
      return
    }
    resetControlsTimer()
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    }
  }, [isActive, resetControlsTimer])

  const persistCallStatus = useCallback(
    async (status: CallStatus, reason?: string) => {
      if (!callId) {
        return
      }

      if (lastPersistedCallStatusRef.current === status && !reason) {
        return
      }

      try {
        const callService = callServiceRef.current ?? createCallService()
        callServiceRef.current = callService
        await callService.updateCallStatus(callId, status, reason)
        lastPersistedCallStatusRef.current = status
      } catch (error) {
        logger.warn('[UnifiedVideoCall] Failed to persist call status', {
          callId,
          status,
          error,
        })
      }
    },
    [callId]
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
        const callService = callServiceRef.current ?? createCallService()
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
    [callId, debugLogger, roomId, userId, userType]
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
          onCallStartRef.current?.()
        } else if (state === 'disconnected' || state === 'closed') {
          setIsChatReady(false)
        }
      })
    )

    unsubs.push(
      webrtcClient.on('local-stream', (stream) => {
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
      })
    )

    unsubs.push(
      webrtcClient.on('remote-stream', (stream, remoteUserId) => {
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
        setTimeout(() => {
          const el = remoteVideosRef.current.get(remoteUserId)
          if (el && el.srcObject !== stream) el.srcObject = stream
        }, 100)
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
          return updated
        })
        remoteVideosRef.current.delete(remoteUserId)
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
      webrtcClient.on('error', (error) => {
        logger.error('[UnifiedVideoCall] WebRTC error:', error)
        emitDebug('error', 'Evento de error WebRTC recibido', { error })
        const msg = error instanceof Error ? error.message : 'Error desconocido'
        setCallError(`Error de videollamada: ${msg}`)
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
    }
  // retryKey causa re-mount del cliente cuando se incrementa (intento de reconexión)
  // Callbacks (onCallStart, onError, onStatusChange) viven en refs para evitar
  // que re-renders del parent destruyan la conexión WebRTC en vuelo.
  }, [autoStart, cloudflareCallsApiUrl, emitDebug, iceServers, retryKey, roomId, userId, userName, userType])

  /* ── Duration timer ── */
  useEffect(() => {
    if (connectionState === 'connected') {
      setConnectedAt((prev) => prev ?? Date.now())
      connectedAtRef.current ??= Date.now()
    } else {
      setConnectedAt(null)
      setElapsedSeconds(0)
      connectedAtRef.current = null
      setQualityLevel('unknown')
    }
  }, [connectionState])

  useEffect(() => {
    if (connectedAt === null) return
    const tick = () => setElapsedSeconds(Math.floor((Date.now() - connectedAt) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [connectedAt])

  /* ── Wake Lock: keep screen on during active call ── */
  useEffect(() => {
    if (!isActive) return
    void acquireWakeLock()
    const cleanup = setupWakeLockVisibilityHandler()
    return () => {
      cleanup()
      void releaseWakeLock()
    }
  }, [isActive])

  /* ── Pause video when tab hidden (save CPU/battery) ── */
  useEffect(() => {
    if (!isActive || !client) return
    return setupVisibilityVideoPause(() => client.getLocalStream())
  }, [isActive, client])

  useEffect(() => {
    if (!callId || !hasStartedCallRef.current) {
      return
    }

    if (connectionState === 'connecting') {
      void persistCallStatus('connecting')
      return
    }

    if (connectionState === 'connected') {
      void persistCallStatus('connected')
      return
    }

    if ((connectionState === 'closed' || connectionState === 'failed') && !manualHangupRef.current) {
      void persistCallStatus('ended', 'connection_closed')
    }
  }, [callId, connectionState, persistCallStatus])

  /* ── Stream sync effects ── */
  useEffect(() => {
    remoteUsers.forEach((user, uid) => {
      if (!user.stream) return
      const el = remoteVideosRef.current.get(uid)
      if (el && el.srcObject !== user.stream) el.srcObject = user.stream
    })
  }, [remoteUsers])

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
      setCallError(`No se pudo iniciar: ${msg}`)
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
      return
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      applyScreenShareHint(stream)
      setScreenStream(stream)
      setIsScreenSharing(true)
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        setScreenStream(null)
        setIsScreenSharing(false)
      })
    } catch {
      setIsScreenSharing(false)
    }
  }, [isScreenSharing, screenStream])

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
    if (!warmUpResult?.stream || isActive) return

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
  }, [warmUpResult, isActive])

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
    emitDebug('info', 'Switched to audio-only mode due to poor connection')
  }, [client, emitDebug])

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
      onMouseMove={isActive ? resetControlsTimer : undefined}
    >
      {/* ── Main video area ── */}
      <div className="absolute inset-0">
        {/* Green Room — pre-call experience */}
        {isIdle && (
          <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-neutral-800 via-neutral-900 to-neutral-950 px-4">
            {/* Camera preview — live from pre-warm */}
            <div className="relative mb-6 w-full max-w-md overflow-hidden rounded-2xl bg-slate-800 shadow-2xl shadow-black/40 ring-1 ring-white/10 aspect-video">
              <video
                ref={(el) => {
                  localVideoRef.current = el
                  if (el && client) {
                    const s = client.getLocalStream()
                    if (s && el.srcObject !== s) el.srcObject = s
                  }
                }}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover -scale-x-100"
              />
              {!warmUpResult && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-800/80">
                  {isWarmingUp ? (
                    <div className="text-center">
                      <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-400 mb-2" />
                      <p className="text-sm text-slate-400">Preparando cámara...</p>
                    </div>
                  ) : (
                    <UserCircle className="h-16 w-16 text-slate-600" />
                  )}
                </div>
              )}

              {/* Audio VU meter — overlaid on video preview */}
              {warmUpResult && (
                <div className="absolute bottom-3 left-3 right-3">
                  <div className="flex items-end gap-0.5 h-5 rounded-lg bg-black/30 px-2 py-1 backdrop-blur-sm">
                    {Array.from({ length: 16 }).map((_, i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-full transition-all duration-100 ${
                          audioLevel * 16 > i
                            ? i < 10 ? 'bg-emerald-400' : i < 13 ? 'bg-amber-400' : 'bg-red-400'
                            : 'bg-white/10'
                        }`}
                        style={{ height: `${Math.max(20, (i / 16) * 100)}%` }}
                      />
                    ))}
                    <Volume2 className="h-3.5 w-3.5 text-white/50 ml-1.5 shrink-0" />
                  </div>
                </div>
              )}
            </div>

            {/* Readiness checks */}
            {warmUpResult && (
              <div className="mb-4 flex items-center gap-4 text-xs">
                <div className={`flex items-center gap-1.5 ${greenRoomChecks.hasVideo ? 'text-emerald-400' : 'text-red-400'}`}>
                  {greenRoomChecks.hasVideo ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  Cámara
                </div>
                <div className={`flex items-center gap-1.5 ${greenRoomChecks.hasAudio ? 'text-emerald-400' : 'text-red-400'}`}>
                  {greenRoomChecks.hasAudio ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  Micrófono
                </div>
                <div className={`flex items-center gap-1.5 ${greenRoomChecks.hasSignaling ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {greenRoomChecks.hasSignaling ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Red
                </div>
                {warmUpResult.latencyMs !== null && (
                  <span className="text-slate-500">{warmUpResult.latencyMs}ms</span>
                )}
              </div>
            )}

            {/* Device selectors */}
            {availableDevices.length > 0 && (
              <div className="mb-5 flex flex-wrap gap-2 justify-center">
                {availableDevices.filter(d => d.kind === 'videoinput').length > 1 && (
                  <div className="relative">
                    <Video className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    <select
                      value={selectedVideoDevice}
                      onChange={(e) => handleDeviceChange('video', e.target.value)}
                      className="appearance-none rounded-lg border border-white/10 bg-white/5 pl-8 pr-8 py-2 text-xs text-white backdrop-blur-sm focus:outline-none focus:ring-1 focus:ring-white/20 transition-colors hover:bg-white/10"
                    >
                      {availableDevices.filter(d => d.kind === 'videoinput').map(d => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                  </div>
                )}
                {availableDevices.filter(d => d.kind === 'audioinput').length > 1 && (
                  <div className="relative">
                    <Mic className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                    <select
                      value={selectedAudioDevice}
                      onChange={(e) => handleDeviceChange('audio', e.target.value)}
                      className="appearance-none rounded-lg border border-white/10 bg-white/5 pl-8 pr-8 py-2 text-xs text-white backdrop-blur-sm focus:outline-none focus:ring-1 focus:ring-white/20 transition-colors hover:bg-white/10"
                    >
                      {availableDevices.filter(d => d.kind === 'audioinput').map(d => (
                        <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                  </div>
                )}
              </div>
            )}

            <h2 className="mb-1 text-xl font-semibold text-white sm:text-2xl">Consulta médica</h2>
            <p className="mb-5 text-sm text-slate-400">
              {userName && `${userName} • `}Sala {roomId}
            </p>

            {callError && (
              <div className="mb-4 rounded-lg bg-red-500/20 px-4 py-2 text-sm text-red-300">{callError}</div>
            )}

            <button
              onClick={startCall}
              disabled={isWarmingUp}
              className={`inline-flex items-center gap-3 rounded-full px-10 py-4 text-lg font-semibold text-white shadow-xl transition-all hover:scale-[1.03] active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed ${
                accentColor === 'violet'
                  ? 'bg-gradient-to-r from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 shadow-violet-600/25'
                  : 'bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 shadow-sky-600/25'
              }`}
              title={greenRoomChecks.allReady ? 'Todo listo — conectará al instante' : 'Iniciar videollamada'}
            >
              <Phone className="h-6 w-6" />
              {userType === 'doctor' ? 'Iniciar consulta' : 'Unirse a consulta'}
            </button>

            {greenRoomChecks.allReady && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-400/80">
                <CheckCircle2 className="h-3.5 w-3.5" /> Todo listo — conexión instantánea
              </p>
            )}

            {connectionState === 'failed' && !callError && (
              <p className="mt-3 text-sm text-red-400">Error de conexión. Intenta nuevamente.</p>
            )}
          </div>
        )}

        {/* Connecting state / Retrying state */}
        {(connectionState === 'connecting' || isRetrying) && (
          <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-neutral-800 via-neutral-900 to-neutral-950">
            <div className="relative mb-6">
              <div className={`absolute inset-0 animate-pulse-ring rounded-full ${accentColor === 'violet' ? 'bg-violet-500/20' : 'bg-sky-500/20'}`} />
              <div className={`absolute inset-[-8px] animate-pulse-ring rounded-full ${accentColor === 'violet' ? 'bg-violet-500/10' : 'bg-sky-500/10'}`} style={{ animationDelay: '0.5s' }} />
              <div className={`flex h-20 w-20 items-center justify-center rounded-full ${accentColor === 'violet' ? 'bg-violet-600/20' : 'bg-sky-600/20'}`}>
                <Loader2 className={`h-10 w-10 animate-spin ${accentColor === 'violet' ? 'text-violet-400' : 'text-sky-400'}`} />
              </div>
            </div>
            {isRetrying ? (
              <>
                <p className="text-lg font-semibold text-white">Reconectando...</p>
                <p className="mt-1.5 text-sm text-amber-400">Intento {retryCountRef.current} de 3</p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold text-white">Conectando...</p>
                <p className="mt-1.5 text-sm text-slate-400">Sala: {roomId}</p>
              </>
            )}
          </div>
        )}

        {/* Connected — PiP layout */}
        {isActive && (
          <>
            {/* Remote video (full area) or waiting */}
            {firstRemote ? (
              <div className="h-full w-full">
                {Array.from(remoteUsers.entries()).map(([remoteUserId, remoteUser]) => {
                  const hasActiveVideo = !!(
                    remoteUser.stream?.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled)
                  )
                  const displayName =
                    remoteUser.userName && remoteUser.userName !== remoteUserId
                      ? remoteUser.userName
                      : remoteUserId
                  const initials = displayName.split(/[\s-]/)[0]?.charAt(0)?.toUpperCase() ?? '?'
                  const roleLabel =
                    remoteUser.userType === 'doctor'
                      ? 'Doctor'
                      : remoteUser.userType === 'patient'
                        ? 'Paciente'
                        : 'Participante'
                  return (
                    <div key={remoteUserId} className="relative h-full w-full bg-neutral-900">
                      {/* Video element — siempre renderizado para sync de stream */}
                      <video
                        ref={(el) => {
                          if (el) {
                            remoteVideosRef.current.set(remoteUserId, el)
                            if (remoteUser.stream) el.srcObject = remoteUser.stream
                          } else {
                            remoteVideosRef.current.delete(remoteUserId)
                          }
                        }}
                        autoPlay
                        playsInline
                        className={`h-full w-full object-cover transition-opacity duration-700 ${hasActiveVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                      />

                      {/* Avatar fallback cuando el video no está activo */}
                      {!hasActiveVideo && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-neutral-800 via-neutral-900 to-neutral-950">
                          <div
                            className={`flex h-28 w-28 items-center justify-center rounded-full text-4xl font-bold text-white shadow-2xl ring-4 ring-white/10 ${
                              accentColor === 'violet' ? 'bg-violet-700' : 'bg-sky-700'
                            }`}
                          >
                            {initials}
                          </div>
                          <p className="mt-5 text-xl font-semibold text-white">{displayName}</p>
                          <p
                            className={`mt-1 text-sm font-medium ${accentColor === 'violet' ? 'text-violet-400' : 'text-sky-400'}`}
                          >
                            {roleLabel}
                          </p>
                          {remoteUser.stream ? (
                            <div className="mt-4 flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs text-slate-300 backdrop-blur-sm">
                              <VideoOff className="h-3.5 w-3.5" />
                              <span>Cámara desactivada</span>
                            </div>
                          ) : (
                            <div className="mt-4 flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs text-slate-400 backdrop-blur-sm">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              <span>Conectando video...</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Etiqueta del usuario remoto (solo cuando el video está activo) */}
                      {hasActiveVideo && (
                        <div className="absolute left-4 top-16 flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 text-xs backdrop-blur-xl">
                          <UserCircle className="h-3.5 w-3.5 text-slate-300" />
                          <span className="font-medium">{displayName}</span>
                          <span className="text-slate-500">{roleLabel}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-neutral-800 via-neutral-900 to-neutral-950">
                <div className="relative mb-6">
                  <div className="absolute inset-[-6px] animate-pulse-ring rounded-full bg-white/5" />
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-neutral-700 to-neutral-800 ring-2 ring-white/10">
                    <Users className="h-10 w-10 text-slate-400" />
                  </div>
                </div>
                <p className="text-lg font-medium text-white">Esperando al participante...</p>
                <p className="mt-1.5 text-sm text-slate-500">La consulta comenzará cuando se una</p>
                <div className="mt-4 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs text-slate-500">Tu conexión está activa</span>
                </div>
              </div>
            )}

            {/* Local video PiP (bottom-right) */}
            <div className="absolute bottom-28 right-4 z-10 h-36 w-52 overflow-hidden rounded-2xl bg-slate-800 shadow-2xl shadow-black/50 ring-1 ring-white/15 transition-all hover:scale-[1.03] hover:ring-white/30 sm:h-44 sm:w-64 md:right-6">
              <video
                ref={(el) => {
                  localVideoRef.current = el
                  if (el && client) {
                    const s = client.getLocalStream()
                    if (s && el.srcObject !== s) el.srcObject = s
                  }
                }}
                autoPlay
                muted
                playsInline
                className={`h-full w-full object-cover -scale-x-100 transition-opacity duration-300 ${isVideoEnabled ? 'opacity-100' : 'opacity-0'}`}
              />
              {!isVideoEnabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
                  <VideoOff className="h-8 w-8 text-slate-500" />
                </div>
              )}
              <div className="absolute bottom-0 inset-x-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
                <span className="text-[11px] font-medium text-white/80">Tú</span>
                {!isAudioEnabled && <MicOff className="h-3 w-3 text-red-400" />}
              </div>
            </div>

            {/* Screen share overlay */}
            {isScreenSharing && screenStream && (
              <div className="absolute left-4 top-16 z-10 h-36 w-52 overflow-hidden rounded-xl border border-blue-500/40 bg-black shadow-lg">
                <video ref={screenShareRef} autoPlay muted playsInline className="h-full w-full object-contain" />
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                  <span className="flex items-center gap-1 text-xs">
                    <ScreenShare className="h-3 w-3" /> Compartiendo
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Top bar (overlay, visible during active call) ── */}
      {isActive && (
        <div
          className={`absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/40 via-black/20 to-transparent px-4 py-3 transition-opacity duration-500 ${
            controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-2">
            {/* Connection + quality merged */}
            <div className="flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1 text-[11px] backdrop-blur-xl">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-medium">Conectado</span>
              {qualityLevel !== 'unknown' && qualityLevel !== 'good' && qualityLevel !== 'excellent' && (
                <>
                  <span className="text-white/20">·</span>
                  <Wifi className={`h-3 w-3 ${qualityColor[qualityLevel]}`} />
                  <span className={qualityColor[qualityLevel]}>{qualityLabel[qualityLevel]}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Duration */}
            <div className="flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1 text-[11px] backdrop-blur-xl">
              <Clock className="h-3 w-3 text-slate-400" />
              <span className="font-mono">{formattedDuration}</span>
            </div>

            {/* Participants */}
            <div className="flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 text-[11px] backdrop-blur-xl">
              <Users className="h-3 w-3 text-slate-400" />
              <span>{totalParticipants}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Error toast ── */}
      {callError && isActive && (
        <div className="absolute inset-x-0 top-14 z-30 flex justify-center px-4">
          <div className="rounded-xl bg-red-500/90 px-4 py-2 text-sm shadow-lg ring-1 ring-red-400/20 backdrop-blur-sm">
            {callError}
          </div>
        </div>
      )}

      {isActive && isTestRoom && (
        <div className="absolute left-4 top-14 z-30">
          <div className="rounded-full border border-amber-400/20 bg-black/30 px-2.5 py-0.5 text-[10px] text-amber-400/60 backdrop-blur-xl">
            Test
          </div>
        </div>
      )}

      {/* ── Floating controls (bottom) ── */}
      {isActive && (
        <div
          className={`absolute inset-x-0 bottom-0 z-20 flex items-center justify-center pb-6 pt-12 bg-gradient-to-t from-black/40 via-black/15 to-transparent transition-opacity duration-500 ${
            controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-2 shadow-xl shadow-black/20 backdrop-blur-2xl ring-1 ring-white/[0.08] sm:gap-3 sm:px-4">
            {/* Mic */}
            <button
              onClick={toggleAudio}
              className={`flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95 sm:h-12 sm:w-12 ${
                isAudioEnabled
                  ? 'bg-white/10 text-white hover:bg-white/20'
                  : 'bg-red-500/80 text-white hover:bg-red-500'
              }`}
              title={isAudioEnabled ? 'Silenciar' : 'Activar micrófono'}
            >
              {isAudioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </button>

            {/* Camera */}
            <button
              onClick={toggleVideo}
              className={`flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95 sm:h-12 sm:w-12 ${
                isVideoEnabled
                  ? 'bg-white/10 text-white hover:bg-white/20'
                  : 'bg-red-500/80 text-white hover:bg-red-500'
              }`}
              title={isVideoEnabled ? 'Desactivar cámara' : 'Activar cámara'}
            >
              {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </button>

            {/* Screen share */}
            {typeof window !== 'undefined' && typeof navigator?.mediaDevices?.getDisplayMedia === 'function' && (
              <button
                onClick={toggleScreenShare}
                className={`flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95 sm:h-12 sm:w-12 ${
                  isScreenSharing
                    ? 'bg-blue-500 text-white hover:bg-blue-400'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
                title={isScreenSharing ? 'Dejar de compartir' : 'Compartir pantalla'}
              >
                {isScreenSharing ? <ScreenShare className="h-5 w-5" /> : <ScreenShareOff className="h-5 w-5" />}
              </button>
            )}

            {/* Chat */}
            <button
              onClick={toggleChatPanel}
              className={`relative flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95 sm:h-12 sm:w-12 ${
                isChatPanelOpen
                  ? accentColor === 'violet'
                    ? 'bg-violet-600 text-white'
                    : 'bg-sky-600 text-white'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
              title={isChatPanelOpen ? 'Cerrar chat' : 'Abrir chat'}
            >
              <MessageSquare className="h-5 w-5" />
              {!isChatPanelOpen && unreadMessages > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold">
                  {unreadMessages > 99 ? '99+' : unreadMessages}
                </span>
              )}
            </button>

            {/* PiP */}
            {typeof document !== 'undefined' && document.pictureInPictureEnabled && (
              <button
                onClick={togglePiP}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-all hover:bg-white/20 active:scale-95 sm:h-12 sm:w-12"
                title="Picture-in-Picture"
              >
                <PictureInPicture2 className="h-5 w-5" />
              </button>
            )}

            {/* Divider */}
            <div className="mx-1 h-8 w-px bg-white/10" />

            {/* End call */}
            <button
              onClick={endCall}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b from-red-500 to-red-600 text-white shadow-lg shadow-red-600/30 transition-all hover:from-red-400 hover:to-red-500 hover:scale-105 active:scale-95 sm:h-14 sm:w-14"
              title="Terminar videollamada"
            >
              <PhoneOff className="h-6 w-6" />
            </button>
          </div>
        </div>
      )}

      {/* ── Chat panel (slide-in from right) ── */}
      {isActive && (
        <aside
          className={`absolute right-0 top-0 bottom-0 z-30 flex w-full flex-col border-l border-white/[0.06] bg-neutral-900/[0.97] backdrop-blur-2xl transition-transform duration-300 ease-out md:w-96 ${
            isChatPanelOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
          style={{
            width: isDesktopViewport ? '24rem' : '100%',
            maxWidth: isDesktopViewport ? '24rem' : '100%',
          }}
        >
          {/* Chat header */}
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
            <div>
              <h3 className="font-semibold text-white">Chat de consulta</h3>
              <p className="text-xs text-slate-400">
                {isChatReady ? (
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Canal activo
                  </span>
                ) : (
                  'Conectando canal...'
                )}
              </p>
            </div>
            <button
              onClick={() => setIsChatPanelOpen(false)}
              className="rounded-full p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              title="Cerrar chat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <div ref={chatMessagesRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${
                  accentColor === 'violet' ? 'bg-violet-500/10' : 'bg-sky-500/10'
                }`}>
                  <MessageSquare className={`h-7 w-7 ${
                    accentColor === 'violet' ? 'text-violet-400' : 'text-sky-400'
                  }`} />
                </div>
                <p className="text-sm font-medium text-slate-400">Sin mensajes aún</p>
                <p className="mt-1.5 max-w-[200px] text-xs text-slate-600">
                  Coordiná durante la consulta usando el chat
                </p>
              </div>
            )}

            {chatMessages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                    msg.mine
                      ? accentColor === 'violet'
                        ? 'bg-violet-600 text-white'
                        : 'bg-sky-600 text-white'
                      : 'bg-white/[0.06] text-slate-100'
                  }`}
                >
                  <p className="text-[11px] font-semibold opacity-80">{msg.senderLabel}</p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                  <p className="mt-1 text-[10px] opacity-60">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <form onSubmit={handleChatSubmit} className="border-t border-white/[0.06] p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                rows={1}
                placeholder="Escribe un mensaje..."
                className="flex-1 resize-none rounded-xl border border-white/[0.06] bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:bg-white/[0.07] focus:border-white/15 focus:outline-none transition-colors"
              />
              <button
                type="submit"
                disabled={!isChatReady || chatInput.trim().length === 0}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                  accentColor === 'violet'
                    ? 'bg-violet-600 hover:bg-violet-500 text-white'
                    : 'bg-sky-600 hover:bg-sky-500 text-white'
                }`}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </aside>
      )}

      {/* ── Audio-only suggestion ── */}
      {isActive && showAudioOnlySuggestion && (
        <div className="absolute left-4 bottom-28 z-30 flex max-w-sm items-center gap-3 rounded-2xl bg-amber-950/80 px-4 py-3 text-sm shadow-lg ring-1 ring-amber-500/10 backdrop-blur-xl">
          <AlertTriangle className="h-5 w-5 text-amber-300 shrink-0" />
          <div>
            <p className="text-amber-100 font-medium">Conexión inestable</p>
            <p className="text-amber-200/70 text-xs">Solo audio puede mejorar la experiencia</p>
          </div>
          <button
            onClick={switchToAudioOnly}
            className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 transition-colors"
          >
            Solo audio
          </button>
          <button
            onClick={() => setShowAudioOnlySuggestion(false)}
            className="shrink-0 rounded-full p-1 text-amber-300 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Quality badge (poor/fair) ── */}
      {isActive && (qualityLevel === 'poor' || qualityLevel === 'fair') && !showAudioOnlySuggestion && (
        <div className="absolute left-4 bottom-24 z-20 flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1 text-[11px] backdrop-blur-xl">
          <WifiOff className={`h-3 w-3 ${qualityColor[qualityLevel]}`} />
          <span className={qualityColor[qualityLevel]}>Conexión {qualityLabel[qualityLevel].toLowerCase()}</span>
        </div>
      )}
    </div>
  )
}
