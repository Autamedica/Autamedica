'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { FormEvent, JSX, KeyboardEvent } from 'react'
import { logger } from '@autamedica/shared'
import {
  WebRTCClient,
  type ChatMessage,
  type ConnectionState,
  type MediaConstraints,
  type StreamQualityLevel,
} from './webrtc-client'
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
} from 'lucide-react'

/* ── Props ── */

export interface UnifiedVideoCallProps {
  roomId: string
  userId: string
  userType: 'doctor' | 'patient' | 'nurse'
  userName?: string
  onCallEnd?: () => void
  onCallStart?: () => void
  onStatusChange?: (status: ConnectionState) => void
  onError?: (error: unknown) => void
  className?: string
  theme?: 'doctor' | 'patient'
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

/* ── Component ── */

export function UnifiedVideoCall({
  roomId,
  userId,
  userType,
  userName,
  onCallEnd,
  onCallStart,
  onStatusChange,
  onError,
  className = '',
  theme = userType === 'doctor' ? 'doctor' : 'patient',
}: UnifiedVideoCallProps): JSX.Element {
  /* ── State ── */
  const [client, setClient] = useState<WebRTCClient | null>(null)
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

  /* ── Refs ── */
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideosRef = useRef<Map<string, HTMLVideoElement>>(new Map())
  const screenShareRef = useRef<HTMLVideoElement>(null)
  const chatMessagesRef = useRef<HTMLDivElement>(null)
  const chatPanelOpenRef = useRef(false)
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ── Derived ── */
  const accentColor = theme === 'doctor' ? 'violet' : 'sky'
  const totalParticipants = remoteUsers.size + 1
  const isActive = connectionState === 'connected'
  const isIdle = connectionState === 'disconnected' || connectionState === 'failed'
  const firstRemote = remoteUsers.size > 0 ? Array.from(remoteUsers.entries())[0] : null

  /* ── Controls auto-hide ── */
  const resetControlsTimer = useCallback(() => {
    setControlsVisible(true)
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 5000)
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

  /* ── WebRTC setup ── */
  useEffect(() => {
    chatPanelOpenRef.current = isChatPanelOpen
  }, [isChatPanelOpen])

  useEffect(() => {
    logger.info(`[UnifiedVideoCall] Initializing for ${userType}: ${userId} in room ${roomId}`)

    const webrtcClient = new WebRTCClient({ userId, userName, userType, roomId })
    const unsubs: Array<() => void> = []

    unsubs.push(
      webrtcClient.on('connection-state', (state) => {
        setConnectionState(state)
        onStatusChange?.(state)
        if (state === 'failed') {
          setCallError('Error de conexión. Verifica tu internet.')
        } else if (state === 'connected') {
          setCallError(null)
          onCallStart?.()
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
        setQualityLevel(summary.overallLevel)
      })
    )

    unsubs.push(
      webrtcClient.on('error', (error) => {
        logger.error('[UnifiedVideoCall] WebRTC error:', error)
        const msg = error instanceof Error ? error.message : 'Error desconocido'
        setCallError(`Error de videollamada: ${msg}`)
        onError?.(error)
      })
    )

    setClient(webrtcClient)
    return () => {
      unsubs.forEach((u) => u())
      void webrtcClient.disconnect()
    }
  }, [onCallStart, onError, onStatusChange, roomId, userId, userName, userType])

  /* ── Duration timer ── */
  useEffect(() => {
    if (connectionState === 'connected') {
      setConnectedAt((prev) => prev ?? Date.now())
    } else {
      setConnectedAt(null)
      setElapsedSeconds(0)
    }
  }, [connectionState])

  useEffect(() => {
    if (connectedAt === null) return
    const tick = () => setElapsedSeconds(Math.floor((Date.now() - connectedAt) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [connectedAt])

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
    if (!client || connectionState === 'connected') return
    try {
      setCallError(null)
      const constraints: MediaConstraints = {
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      }
      await client.startLocalStream(constraints)
      await client.connect(roomId)
      setIsVideoEnabled(true)
      setIsAudioEnabled(true)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido'
      setCallError(`No se pudo iniciar: ${msg}`)
    }
  }, [client, connectionState, roomId])

  const endCall = useCallback(async () => {
    if (!client) return
    try {
      await client.disconnect()
      if (screenStream) {
        screenStream.getTracks().forEach((t) => t.stop())
        setScreenStream(null)
        setIsScreenSharing(false)
      }
      onCallEnd?.()
    } catch {
      /* swallow */
    }
  }, [client, onCallEnd, screenStream])

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

  const sendChat = useCallback(() => {
    if (!client) return
    const text = chatInput.trim()
    if (!text) return

    if (!client.sendChatMessage(text)) {
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
  }, [chatInput, client, userId, userName, userType])

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

  /* ── Render ── */
  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-slate-900 text-white ${className}`}
      onMouseMove={isActive ? resetControlsTimer : undefined}
    >
      {/* ── Main video area ── */}
      <div className="absolute inset-0">
        {/* Idle/disconnected state */}
        {isIdle && (
          <div className="flex h-full flex-col items-center justify-center bg-gradient-to-b from-slate-800 to-slate-900">
            {/* Camera preview */}
            <div className="relative mb-8 h-48 w-64 overflow-hidden rounded-2xl bg-slate-800 shadow-2xl ring-1 ring-white/10 sm:h-56 sm:w-80">
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
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-slate-800/60">
                <UserCircle className="h-16 w-16 text-slate-500" />
              </div>
            </div>

            <h2 className="mb-2 text-xl font-semibold text-white sm:text-2xl">Consulta médica</h2>
            <p className="mb-6 text-sm text-slate-400">
              Sala: {roomId} {userName && `• ${userName}`}
            </p>

            {callError && (
              <div className="mb-4 rounded-lg bg-red-500/20 px-4 py-2 text-sm text-red-300">{callError}</div>
            )}

            <button
              onClick={startCall}
              className={`inline-flex items-center gap-3 rounded-full px-8 py-4 text-lg font-semibold text-white shadow-xl transition-all hover:scale-105 active:scale-95 ${
                accentColor === 'violet'
                  ? 'bg-violet-600 hover:bg-violet-500 shadow-violet-600/30'
                  : 'bg-sky-600 hover:bg-sky-500 shadow-sky-600/30'
              }`}
              title="Iniciar videollamada"
            >
              <Phone className="h-6 w-6" />
              {userType === 'doctor' ? 'Iniciar consulta' : 'Unirse a consulta'}
            </button>

            {connectionState === 'failed' && (
              <p className="mt-3 text-sm text-red-400">Error de conexión. Intenta nuevamente.</p>
            )}
          </div>
        )}

        {/* Connecting state */}
        {connectionState === 'connecting' && (
          <div className="flex h-full flex-col items-center justify-center bg-slate-900">
            <Loader2 className="mb-4 h-12 w-12 animate-spin text-blue-400" />
            <p className="text-lg font-medium text-slate-300">Estableciendo conexión...</p>
            <p className="mt-1 text-sm text-slate-500">Conectando con el servidor de señalización</p>
          </div>
        )}

        {/* Connected — PiP layout */}
        {isActive && (
          <>
            {/* Remote video (full area) or waiting */}
            {firstRemote ? (
              <div className="h-full w-full bg-slate-900">
                {Array.from(remoteUsers.entries()).map(([remoteUserId, remoteUser]) => (
                  <div key={remoteUserId} className="relative h-full w-full">
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
                      className="h-full w-full object-cover"
                    />
                    {/* Remote user label */}
                    <div
                      className={`absolute left-4 top-4 flex items-center gap-2 rounded-lg bg-black/50 px-3 py-1.5 text-sm backdrop-blur-md transition-opacity ${
                        controlsVisible ? 'opacity-100' : 'opacity-0'
                      }`}
                    >
                      <UserCircle className="h-4 w-4" />
                      <span>{remoteUser.userName || remoteUser.userId}</span>
                      <span className="text-slate-400">
                        ({remoteUser.userType === 'doctor' ? 'Doctor' : 'Paciente'})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center bg-slate-900">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-slate-800 ring-1 ring-white/10">
                  <Users className="h-10 w-10 text-slate-500" />
                </div>
                <p className="text-lg font-medium text-slate-300">Esperando al participante...</p>
                <p className="mt-1 text-sm text-slate-500">La consulta comenzará cuando se una</p>
              </div>
            )}

            {/* Local video PiP (bottom-right) */}
            <div className="absolute bottom-24 right-4 z-10 h-32 w-44 overflow-hidden rounded-xl bg-slate-800 shadow-2xl ring-1 ring-white/20 transition-all sm:h-40 sm:w-56">
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
                className={`h-full w-full object-cover transition-opacity ${isVideoEnabled ? 'opacity-100' : 'opacity-0'}`}
              />
              {!isVideoEnabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
                  <VideoOff className="h-8 w-8 text-slate-500" />
                </div>
              )}
              <div className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-xs backdrop-blur-sm">
                Tú {!isAudioEnabled && <MicOff className="ml-1 inline h-3 w-3 text-red-400" />}
              </div>
            </div>

            {/* Screen share overlay */}
            {isScreenSharing && screenStream && (
              <div className="absolute left-4 top-4 z-10 h-36 w-52 overflow-hidden rounded-xl border-2 border-blue-500/60 bg-black shadow-lg">
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
          className={`absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-4 py-3 transition-opacity duration-300 ${
            controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-3">
            {/* Connection indicator */}
            <div className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 text-xs backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-medium">Conectado</span>
            </div>

            {/* Quality */}
            {qualityLevel !== 'unknown' && (
              <div className={`flex items-center gap-1 text-xs ${qualityColor[qualityLevel]}`}>
                <Wifi className="h-3.5 w-3.5" />
                <span>{qualityLabel[qualityLevel]}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Duration */}
            <div className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 text-xs backdrop-blur-md">
              <Clock className="h-3.5 w-3.5 text-slate-300" />
              <span className="font-mono">{formattedDuration}</span>
            </div>

            {/* Participants */}
            <div className="flex items-center gap-1 rounded-full bg-black/40 px-3 py-1 text-xs backdrop-blur-md">
              <Users className="h-3.5 w-3.5" />
              <span>{totalParticipants}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Error toast ── */}
      {callError && isActive && (
        <div className="absolute inset-x-0 top-14 z-30 flex justify-center px-4">
          <div className="rounded-lg bg-red-500/90 px-4 py-2 text-sm shadow-lg backdrop-blur-sm">
            {callError}
          </div>
        </div>
      )}

      {/* ── Floating controls (bottom) ── */}
      {isActive && (
        <div
          className={`absolute inset-x-0 bottom-0 z-20 flex flex-col items-center pb-4 pt-8 bg-gradient-to-t from-black/60 to-transparent transition-opacity duration-300 ${
            controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-2 rounded-full bg-black/50 px-3 py-2 backdrop-blur-xl sm:gap-3 sm:px-4">
            {/* Mic */}
            <button
              onClick={toggleAudio}
              className={`flex h-11 w-11 items-center justify-center rounded-full transition-all sm:h-12 sm:w-12 ${
                isAudioEnabled
                  ? 'bg-white/15 text-white hover:bg-white/25'
                  : 'bg-red-500 text-white hover:bg-red-400'
              }`}
              title={isAudioEnabled ? 'Silenciar' : 'Activar micrófono'}
            >
              {isAudioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </button>

            {/* Camera */}
            <button
              onClick={toggleVideo}
              className={`flex h-11 w-11 items-center justify-center rounded-full transition-all sm:h-12 sm:w-12 ${
                isVideoEnabled
                  ? 'bg-white/15 text-white hover:bg-white/25'
                  : 'bg-red-500 text-white hover:bg-red-400'
              }`}
              title={isVideoEnabled ? 'Desactivar cámara' : 'Activar cámara'}
            >
              {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </button>

            {/* Screen share */}
            {typeof window !== 'undefined' && typeof navigator?.mediaDevices?.getDisplayMedia === 'function' && (
              <button
                onClick={toggleScreenShare}
                className={`flex h-11 w-11 items-center justify-center rounded-full transition-all sm:h-12 sm:w-12 ${
                  isScreenSharing
                    ? 'bg-blue-500 text-white hover:bg-blue-400'
                    : 'bg-white/15 text-white hover:bg-white/25'
                }`}
                title={isScreenSharing ? 'Dejar de compartir' : 'Compartir pantalla'}
              >
                {isScreenSharing ? <ScreenShare className="h-5 w-5" /> : <ScreenShareOff className="h-5 w-5" />}
              </button>
            )}

            {/* Chat */}
            <button
              onClick={toggleChatPanel}
              className={`relative flex h-11 w-11 items-center justify-center rounded-full transition-all sm:h-12 sm:w-12 ${
                isChatPanelOpen
                  ? accentColor === 'violet'
                    ? 'bg-violet-600 text-white'
                    : 'bg-sky-600 text-white'
                  : 'bg-white/15 text-white hover:bg-white/25'
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

            {/* Divider */}
            <div className="mx-1 h-8 w-px bg-white/20" />

            {/* End call */}
            <button
              onClick={endCall}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition-all hover:bg-red-500 hover:scale-105 active:scale-95 sm:h-14 sm:w-14"
              title="Terminar videollamada"
            >
              <PhoneOff className="h-6 w-6" />
            </button>
          </div>

          {/* Status text */}
          <p className="mt-2 text-xs text-slate-400">
            Videollamada activa &bull; {totalParticipants} participante{totalParticipants !== 1 ? 's' : ''}
            {isChatReady ? ' \u2022 chat listo' : ''}
          </p>
        </div>
      )}

      {/* ── Chat panel (slide-in from right) ── */}
      {isActive && (
        <aside
          className={`absolute right-0 top-0 bottom-0 z-30 flex w-full flex-col border-l border-white/10 bg-slate-900/95 backdrop-blur-lg transition-transform duration-300 ease-out md:w-96 ${
            isChatPanelOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {/* Chat header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
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
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              title="Cerrar chat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <div ref={chatMessagesRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <MessageSquare className="mb-3 h-10 w-10 text-slate-600" />
                <p className="text-sm text-slate-500">Sin mensajes aún</p>
                <p className="mt-1 text-xs text-slate-600">
                  Usa el chat para coordinar durante la consulta
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
                      : 'bg-slate-800 text-slate-100'
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
          <form onSubmit={handleChatSubmit} className="border-t border-white/10 p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                rows={1}
                placeholder="Escribe un mensaje..."
                className="flex-1 resize-none rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-white/20 focus:outline-none"
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
            <p className="mt-1.5 text-[10px] text-slate-600">Enter enviar &bull; Shift+Enter nueva línea</p>
          </form>
        </aside>
      )}

      {/* ── Quality badge (poor/fair) ── */}
      {isActive && (qualityLevel === 'poor' || qualityLevel === 'fair') && (
        <div className="absolute left-4 bottom-24 z-20 flex items-center gap-1.5 rounded-lg bg-black/60 px-3 py-1.5 text-xs backdrop-blur-md">
          <WifiOff className={`h-3.5 w-3.5 ${qualityColor[qualityLevel]}`} />
          <span className={qualityColor[qualityLevel]}>Conexión {qualityLabel[qualityLevel].toLowerCase()}</span>
        </div>
      )}
    </div>
  )
}
