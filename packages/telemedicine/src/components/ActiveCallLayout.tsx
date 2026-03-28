'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Loader2,
  Users,
  ScreenShare,
  UserCircle,
  ShieldCheck,
  MessageSquareText,
} from 'lucide-react'
import type { WebRTCClient } from '../webrtc-client'
import type { CloudflareCallsClient } from '../cloudflare-calls'
import { patchVideoPlayback } from '../media-optimizations'

interface RemoteUser {
  userId: string
  userType: string
  userName?: string
  stream?: MediaStream
}

/** PiP component that robustly syncs local stream even during layout transitions */
function LocalVideoPiP({
  localVideoRef,
  client,
  isVideoEnabled,
  isAudioEnabled,
  localLabel,
}: {
  localVideoRef: RefObject<HTMLVideoElement | null>
  client: WebRTCClient | CloudflareCallsClient | null
  isVideoEnabled: boolean
  isAudioEnabled: boolean
  localLabel: string
}) {
  const pipVideoRef = useRef<HTMLVideoElement | null>(null)
  const [hasVideo, setHasVideo] = useState(false)

  // Assign the PiP video element to the shared localVideoRef AND sync stream
  const setRef = useCallback(
    (el: HTMLVideoElement | null) => {
      pipVideoRef.current = el
      ;(localVideoRef as MutableRefObject<HTMLVideoElement | null>).current = el
      if (el && client) {
        const s = client.getLocalStream()
        if (s && el.srcObject !== s) {
          el.srcObject = s
          patchVideoPlayback(el)
        }
      }
    },
    [client, localVideoRef]
  )

  // Re-sync stream periodically: covers race where stream arrives after mount
  useEffect(() => {
    if (!client) return
    const sync = () => {
      const el = pipVideoRef.current
      const s = client.getLocalStream()
      if (el && s && el.srcObject !== s) {
        el.srcObject = s
        patchVideoPlayback(el)
      }
      const liveVideo = !!(s?.getVideoTracks().some(t => t.readyState === 'live' && t.enabled))
      setHasVideo(liveVideo)
    }
    sync()
    const id = setInterval(sync, 500)
    return () => clearInterval(id)
  }, [client])

  return (
    <div className="absolute bottom-28 right-4 z-10 h-36 w-52 overflow-hidden rounded-[26px] border border-white/12 bg-slate-900/90 shadow-[0_24px_60px_rgba(0,0,0,0.45)] ring-1 ring-white/8 transition-all hover:scale-[1.02] hover:ring-white/20 sm:h-44 sm:w-64 md:right-6">
      <div className="absolute left-3 top-3 z-10 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-xl">
        {localLabel}
      </div>
      <video
        ref={setRef}
        autoPlay
        muted
        playsInline
        className={`h-full w-full object-cover -scale-x-100 transition-opacity duration-300 ${hasVideo && isVideoEnabled ? 'opacity-100' : 'opacity-0'}`}
      />
      {(!isVideoEnabled || !hasVideo) && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
          <VideoOff className="h-8 w-8 text-slate-500" />
        </div>
      )}
      {!isAudioEnabled && (
        <div className="absolute bottom-0 inset-x-0 flex items-center justify-end bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
          <MicOff className="h-3.5 w-3.5 text-red-400" />
        </div>
      )}
    </div>
  )
}

function isMachineLikeParticipantId(value: string): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ||
    value.startsWith('user_') ||
    value.startsWith('anon_')
  )
}

export interface ActiveCallLayoutProps {
  remoteUsers: Map<string, RemoteUser>
  remoteVideosRef: MutableRefObject<Map<string, HTMLVideoElement>>
  localVideoRef: RefObject<HTMLVideoElement | null>
  screenShareRef: RefObject<HTMLVideoElement | null>
  client: WebRTCClient | CloudflareCallsClient | null
  isVideoEnabled: boolean
  isAudioEnabled: boolean
  isScreenSharing: boolean
  screenStream: MediaStream | null
  userName?: string
  accentColor: 'violet' | 'sky'
  callError: string | null
}

export function ActiveCallLayout({
  remoteUsers,
  remoteVideosRef,
  localVideoRef,
  screenShareRef,
  client,
  isVideoEnabled,
  isAudioEnabled,
  isScreenSharing,
  screenStream,
  userName,
  accentColor,
  callError,
}: ActiveCallLayoutProps) {
  const [renderableRemoteVideoIds, setRenderableRemoteVideoIds] = useState<Record<string, boolean>>({})
  const firstRemote = remoteUsers.size > 0 ? Array.from(remoteUsers.entries())[0] : null
  const localStream = client?.getLocalStream() ?? null
  const hasLocalVideo = !!(
    localStream?.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled)
  )

  // Poll remote video track readiness — covers race where track arrives after video element mount
  useEffect(() => {
    if (remoteUsers.size === 0) return
    const check = () => {
      remoteUsers.forEach((user, uid) => {
        const hasLive = !!(user.stream?.getVideoTracks().some(t => t.readyState === 'live' && t.enabled))
        if (hasLive && !renderableRemoteVideoIds[uid]) {
          setRenderableRemoteVideoIds(prev => ({ ...prev, [uid]: true }))
        }
      })
    }
    check()
    const id = setInterval(check, 500)
    return () => clearInterval(id)
  }, [remoteUsers, renderableRemoteVideoIds])
  const localLabel = userName?.trim() || 'Tú'
  const accentPanelClass =
    accentColor === 'violet'
      ? 'border-violet-400/20 bg-violet-500/10 text-violet-100'
      : 'border-cyan-400/20 bg-cyan-500/10 text-cyan-100'

  return (
    <>
      {/* Remote video (full area) or waiting */}
      {firstRemote ? (
        <div className="h-full w-full bg-[#09090b]">
          {Array.from(remoteUsers.entries()).map(([remoteUserId, remoteUser]) => {
            const hasActiveTrack = !!(
              remoteUser.stream?.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled)
            )
            const hasActiveVideo = hasActiveTrack && !!renderableRemoteVideoIds[remoteUserId]
            const roleLabel =
              remoteUser.userType === 'doctor'
                ? 'Doctor'
                : remoteUser.userType === 'patient'
                  ? 'Paciente'
                  : 'Participante'
            const displayName =
              remoteUser.userName &&
              remoteUser.userName !== remoteUserId &&
              !isMachineLikeParticipantId(remoteUser.userName)
                ? remoteUser.userName
                : remoteUser.userType === 'doctor'
                  ? 'Profesional de salud'
                  : remoteUser.userType === 'patient'
                    ? 'Paciente conectado'
                    : 'Participante conectado'
            const initials = displayName.split(/[\s-]/)[0]?.charAt(0)?.toUpperCase() ?? '?'
            return (
              <div key={remoteUserId} className="relative h-full w-full overflow-hidden bg-neutral-900">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.14),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.06),_transparent_24%)]" />
                {/* Video element */}
                <video
                  ref={(el) => {
                    if (el) {
                      remoteVideosRef.current.set(remoteUserId, el)
                      if (remoteUser.stream) {
                        el.srcObject = remoteUser.stream
                        patchVideoPlayback(el)
                      }
                    } else {
                      remoteVideosRef.current.delete(remoteUserId)
                    }
                  }}
                  autoPlay
                  playsInline
                  onLoadedMetadata={() =>
                    setRenderableRemoteVideoIds((prev) => ({ ...prev, [remoteUserId]: true }))
                  }
                  onLoadedData={() =>
                    setRenderableRemoteVideoIds((prev) => ({ ...prev, [remoteUserId]: true }))
                  }
                  onPlaying={() =>
                    setRenderableRemoteVideoIds((prev) => ({ ...prev, [remoteUserId]: true }))
                  }
                  onEmptied={() =>
                    setRenderableRemoteVideoIds((prev) => ({ ...prev, [remoteUserId]: false }))
                  }
                  className={`h-full w-full object-cover transition-opacity duration-700 ${hasActiveVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                />

                {/* Avatar fallback */}
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
                        <span>Camara desactivada</span>
                      </div>
                    ) : (
                      <div className="mt-4 flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs text-slate-400 backdrop-blur-sm">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Conectando video...</span>
                      </div>
                    )}

                    <div className="mt-6 w-[min(92%,22rem)] rounded-[24px] border border-white/10 bg-white/6 px-4 py-4 text-left shadow-2xl backdrop-blur-xl">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                        Sala conectada
                      </p>
                      <p className="mt-2 text-base font-semibold text-white">
                        La consulta ya está activa
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-slate-300">
                        Mientras se estabiliza el video remoto, mantenemos el audio y el chat listos
                        para continuar la consulta sin fricción.
                      </p>
                    </div>
                  </div>
                )}

                {/* Remote user label */}
                {hasActiveVideo && (
                  <div className="absolute left-5 top-20 rounded-[22px] border border-white/10 bg-black/45 px-4 py-3 text-white shadow-2xl backdrop-blur-xl">
                    <div className="flex items-center gap-2">
                      <UserCircle className="h-4 w-4 text-slate-300" />
                      <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                        {roleLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold">{displayName}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="relative h-full w-full overflow-hidden bg-[#09090b]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.2),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.08),_transparent_22%),linear-gradient(160deg,_#0b0b0d_0%,_#10141c_48%,_#09090b_100%)]" />
          <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-white/5 blur-3xl" />
          <div className="absolute -right-16 bottom-24 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="relative z-10 flex h-full items-center justify-center px-4 pb-32 pt-24 sm:px-6">
            <div className="grid w-full max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-black/55 shadow-[0_32px_80px_rgba(0,0,0,0.45)]">
                <video
                  ref={(el) => {
                    (localVideoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el
                    if (el && localStream && el.srcObject !== localStream) {
                      el.srcObject = localStream
                      patchVideoPlayback(el)
                    }
                  }}
                  autoPlay
                  muted
                  playsInline
                  className={`h-[56vh] min-h-[340px] w-full object-cover -scale-x-100 transition-opacity duration-300 ${
                    hasLocalVideo && isVideoEnabled ? 'opacity-100' : 'opacity-0'
                  }`}
                />

                {(!isVideoEnabled || !hasLocalVideo) && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-neutral-900 via-neutral-950 to-black text-white">
                    <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/8 ring-1 ring-white/10">
                      <Users className="h-10 w-10 text-slate-400" />
                    </div>
                    <p className="mt-5 text-lg font-semibold">Vista previa no disponible</p>
                    <p className="mt-2 max-w-sm text-center text-sm text-slate-400">
                      Activa tu cámara para revisar cómo te verá el otro participante.
                    </p>
                  </div>
                )}

                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent px-5 pb-6 pt-16 sm:px-7">
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Consultorio listo
                  </div>
                  <h2 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                    Todo listo para entrar a la videoconsulta
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
                    Te mostramos tu vista previa mientras se conecta la otra persona. Cuando entre,
                    la llamada ocupará toda la pantalla automáticamente.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-200">
                    <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5">
                      {localLabel}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5">
                      {isAudioEnabled ? 'Micrófono encendido' : 'Micrófono silenciado'}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5">
                      {isVideoEnabled ? 'Cámara lista' : 'Cámara pausada'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-[30px] border border-white/10 bg-white/6 p-5 text-white shadow-2xl backdrop-blur-2xl">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                    Estado de la sala
                  </p>
                  <div className={`mt-4 rounded-2xl border px-4 py-4 ${accentPanelClass}`}>
                    <p className="text-sm font-semibold">Esperando al otro participante</p>
                    <p className="mt-1 text-sm text-white/80">
                      Mantén abierta esta pantalla. La conexión ya está levantada de tu lado.
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <div className="rounded-2xl border border-white/8 bg-black/25 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-white">
                      <Mic className="h-4 w-4 text-emerald-300" />
                      Audio listo
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      Tu micrófono ya fue validado para la consulta.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/25 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-white">
                      <Video className="h-4 w-4 text-cyan-300" />
                      Vista previa activa
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      Revisa encuadre e iluminación antes de que comience la llamada.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-black/25 px-4 py-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-white">
                      <MessageSquareText className="h-4 w-4 text-amber-300" />
                      Chat disponible
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      Puedes dejar un mensaje apenas la otra persona se conecte.
                    </p>
                  </div>
                </div>

                {!callError && (
                  <div className="mt-5 flex items-center gap-2 text-xs text-slate-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    Tu conexión está activa y esperando respuesta.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Local video PiP (bottom-right) */}
      {firstRemote && (
        <LocalVideoPiP
          localVideoRef={localVideoRef}
          client={client}
          isVideoEnabled={isVideoEnabled}
          isAudioEnabled={isAudioEnabled}
          localLabel={localLabel}
        />
      )}

      {/* Screen share overlay */}
      {isScreenSharing && screenStream && (
        <div className="absolute left-4 top-20 z-10 h-36 w-52 overflow-hidden rounded-[24px] border border-cyan-400/35 bg-black shadow-2xl">
          <video ref={screenShareRef as React.RefObject<HTMLVideoElement>} autoPlay muted playsInline className="h-full w-full object-contain" />
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
            <span className="flex items-center gap-1 text-xs font-medium">
              <ScreenShare className="h-3 w-3" /> Compartiendo
            </span>
          </div>
        </div>
      )}
    </>
  )
}
