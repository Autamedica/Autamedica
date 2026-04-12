'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import { motion } from 'framer-motion'
import {
  VideoOff,
  MicOff,
  MonitorUp,
} from 'lucide-react'
import { springGentle } from './animation-presets'
import type { WebRTCClient } from '../webrtc-client'
import type { CloudflareCallsClient } from '../cloudflare-calls'
import { patchVideoPlayback } from '../media-optimizations'

interface RemoteUser {
  userId: string
  userType: string
  userName?: string
  stream?: MediaStream
}

function AmbientVideoSurface({
  stream,
  mirrored = false,
}: {
  stream: MediaStream
  mirrored?: boolean
}) {
  const ambientRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const element = ambientRef.current
    if (!element || element.srcObject === stream) return
    element.srcObject = stream
    patchVideoPlayback(element)
  }, [stream])

  return (
    <video
      ref={ambientRef}
      autoPlay
      muted
      playsInline
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30 blur-[42px] [filter:saturate(1.24)_brightness(0.95)] ${
        mirrored ? '-scale-x-100 scale-[1.12]' : 'scale-[1.12]'
      }`}
    />
  )
}

/* ── Local Video PiP ── */
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
  const isCompactMode = !isVideoEnabled || !hasVideo

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

  useEffect(() => {
    if (!client) return
    const sync = () => {
      const el = pipVideoRef.current
      const s = client.getLocalStream()
      if (el && s && el.srcObject !== s) {
        el.srcObject = s
        patchVideoPlayback(el)
      }
      setHasVideo(!!(s?.getVideoTracks().some(t => t.readyState === 'live' && t.enabled)))
    }
    sync()
    const id = setInterval(sync, 500)
    return () => clearInterval(id)
  }, [client])

  return (
    <motion.div
      className={`absolute z-10 ${
        isCompactMode
          ? 'bottom-4 right-4 max-w-[calc(100vw-2rem)] rounded-full border border-white/10 bg-slate-800/95 px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.6)] sm:bottom-28 sm:right-6 sm:h-[144px] sm:w-[200px] sm:max-w-none sm:overflow-hidden sm:rounded-2xl sm:px-0 sm:py-0'
          : 'bottom-24 right-4 overflow-hidden rounded-2xl border border-white/10 bg-slate-800 shadow-[0_8px_32px_rgba(0,0,0,0.6)] sm:bottom-28 sm:right-6 h-[120px] w-[160px] sm:h-[144px] sm:w-[200px]'
      }`}
      layout
      whileHover={{ scale: 1.03 }}
      transition={springGentle}
    >
      <video
        ref={setRef}
        autoPlay
        muted
        playsInline
        className={`absolute inset-0 h-full w-full object-cover -scale-x-100 transition-opacity duration-300 ${
          hasVideo && isVideoEnabled ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {isCompactMode ? (
        <>
          <div className="relative z-10 flex items-center gap-2 rounded-full sm:hidden" title={localLabel}>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700">
              <VideoOff className="h-4 w-4 text-slate-300" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white">Tú</p>
              <p className="text-[10px] leading-none text-white/60">Cámara apagada</p>
            </div>
            {!isAudioEnabled && (
              <div className="ml-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500/90">
                <MicOff className="h-3 w-3 text-white" />
              </div>
            )}
          </div>

          <div className="relative hidden h-full w-full items-center justify-center sm:flex">
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-700">
                <VideoOff className="h-7 w-7 text-slate-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-white">Tú</p>
                <p className="mt-1 text-xs text-white/60">Cámara apagada</p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Name label */}
          <div className="absolute left-2 top-2 z-10 rounded-md bg-slate-900/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            {localLabel}
          </div>

          {/* Camera off fallback */}
          {(!isVideoEnabled || !hasVideo) && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-700">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-600">
                <VideoOff className="h-5 w-5 text-slate-400" />
              </div>
            </div>
          )}

          {/* Muted mic indicator */}
          {!isAudioEnabled && (
            <div className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-500/90">
              <MicOff className="h-3 w-3 text-white" />
            </div>
          )}
        </>
      )}
    </motion.div>
  )
}

/* ── Helpers ── */
function isMachineLikeId(value: string): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ||
    value.startsWith('user_') ||
    value.startsWith('anon_')
  )
}

function resolveDisplay(user: RemoteUser): { name: string; role: string; initials: string } {
  const role = user.userType === 'doctor' ? 'Doctor' : user.userType === 'patient' ? 'Paciente' : 'Participante'
  const name =
    user.userName && user.userName !== user.userId && !isMachineLikeId(user.userName)
      ? user.userName
      : user.userType === 'doctor'
        ? 'Profesional de salud'
        : user.userType === 'patient'
          ? 'Paciente'
          : 'Participante'
  const initials = name.split(/[\s-]/)[0]?.charAt(0)?.toUpperCase() ?? '?'
  return { name, role, initials }
}

/* ── Props ── */
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
  callError?: string | null
}

/* ── Main Component ── */
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
  callError: _callError,
}: ActiveCallLayoutProps) {
  const [renderableIds, setRenderableIds] = useState<Record<string, boolean>>({})
  const firstRemote = remoteUsers.size > 0 ? Array.from(remoteUsers.entries())[0] : null
  const localStream = client?.getLocalStream() ?? null
  const hasLocalVideo = !!(localStream?.getVideoTracks().some(t => t.readyState === 'live' && t.enabled))
  const localLabel = userName?.trim() || 'Tú'

  // ── Stream sync (Chrome muted track bug fix) ──
  useEffect(() => {
    remoteUsers.forEach((user, uid) => {
      const el = remoteVideosRef.current.get(uid)
      if (!el || !user.stream) return
      if (el.getAttribute('data-assigned-stream') === user.stream.id) return

      const tracks = user.stream.getTracks()
      const assign = () => {
        el.srcObject = new MediaStream(tracks)
        el.setAttribute('data-assigned-stream', user.stream?.id ?? '')
        patchVideoPlayback(el)
      }

      if (tracks.some(t => t.muted)) {
        const onUnmute = () => { if (tracks.every(t => !t.muted)) assign() }
        tracks.forEach(t => t.addEventListener('unmute', onUnmute, { once: true }))
      } else {
        assign()
      }
    })
  })

  // ── Track readiness polling ──
  useEffect(() => {
    if (remoteUsers.size === 0) return
    const check = () => {
      remoteUsers.forEach((user, uid) => {
        const hasLive = !!(user.stream?.getVideoTracks().some(t => t.readyState === 'live' && t.enabled))
        if (hasLive && !renderableIds[uid]) {
          setRenderableIds(prev => ({ ...prev, [uid]: true }))
        }
      })
    }
    check()
    const id = setInterval(check, 500)
    return () => clearInterval(id)
  }, [remoteUsers, renderableIds])

  return (
    <>
      {firstRemote ? (
        /* ══════ SPEAKER VIEW — remote fullscreen ══════ */
        <div className="h-full w-full bg-slate-950">
          {Array.from(remoteUsers.entries()).map(([remoteUserId, remoteUser]) => {
            const hasTrack = !!(remoteUser.stream?.getVideoTracks().some(t => t.readyState === 'live' && t.enabled))
            const hasVideo = hasTrack && !!renderableIds[remoteUserId]
            const { name, role, initials } = resolveDisplay(remoteUser)

            return (
              <div key={remoteUserId} className="relative h-full w-full">
                {hasVideo && remoteUser.stream && (
                  <>
                    <AmbientVideoSurface stream={remoteUser.stream} />
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_34%,rgba(2,6,23,0.1)_68%,rgba(2,6,23,0.42)_100%)]" />
                  </>
                )}

                {/* Remote video */}
                <video
                  ref={(el) => {
                    if (el) remoteVideosRef.current.set(remoteUserId, el)
                    else remoteVideosRef.current.delete(remoteUserId)
                  }}
                  data-remote-user-id={remoteUserId}
                  data-stream-id={remoteUser.stream?.id ?? ''}
                  autoPlay
                  playsInline
                  onLoadedMetadata={() => setRenderableIds(p => ({ ...p, [remoteUserId]: true }))}
                  onLoadedData={() => setRenderableIds(p => ({ ...p, [remoteUserId]: true }))}
                  onPlaying={() => setRenderableIds(p => ({ ...p, [remoteUserId]: true }))}
                  onEmptied={() => setRenderableIds(p => ({ ...p, [remoteUserId]: false }))}
                  className={`relative h-full w-full object-cover transition-opacity duration-500 scale-[1.03] [filter:saturate(1.04)_contrast(1.03)] ${
                    hasVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                />

                {/* Avatar fallback when no video */}
                {!hasVideo && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-neutral-800 via-neutral-900 to-[#0a0a0a]">
                    <div
                      className={`flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold text-white shadow-2xl sm:h-32 sm:w-32 sm:text-4xl ${
                        accentColor === 'violet'
                          ? 'bg-gradient-to-br from-am-primary-600 to-am-primary-800'
                          : 'bg-gradient-to-br from-am-patient-600 to-am-patient-800'
                      }`}
                    >
                      {initials}
                    </div>
                    <p className="mt-4 text-lg font-semibold text-white sm:text-xl">{name}</p>
                    <p className="mt-1 text-sm text-slate-400">{role}</p>

                    {remoteUser.stream ? (
                      <div className="mt-4 flex items-center gap-2 rounded-full bg-white/8 px-3 py-1.5 text-xs text-slate-300">
                        <VideoOff className="h-3.5 w-3.5" />
                        Cámara desactivada
                      </div>
                    ) : (
                      <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                        <motion.div
                          className="h-1.5 w-1.5 rounded-full bg-am-patient-400"
                          animate={{ opacity: [1, 0.4, 1] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        />
                        Conectando video...
                      </div>
                    )}
                  </div>
                )}

                {/* Remote user name pill (only when video visible) */}
                {hasVideo && (
                  <div className="absolute bottom-28 left-4 rounded-lg bg-slate-900/50 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm sm:bottom-32 sm:left-6">
                    {name}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* ══════ WAITING STATE — local preview centered ══════ */
        <div className="relative flex h-full w-full items-center justify-center bg-slate-950 px-4">
          {/* Background ambient */}
          <div className="absolute inset-0 overflow-hidden">
            <div className={`absolute -left-32 -top-32 h-96 w-96 rounded-full blur-[120px] opacity-20 ${
              accentColor === 'violet' ? 'bg-am-primary-600' : 'bg-am-patient-600'
            }`} />
            <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-white/5 blur-[120px]" />
          </div>

          <div className="relative z-10 w-full max-w-2xl">
            {/* Local video preview */}
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-800 shadow-[0_16px_64px_rgba(0,0,0,0.5)]">
              {hasLocalVideo && isVideoEnabled && localStream && (
                <>
                  <AmbientVideoSurface stream={localStream} mirrored />
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_32%,rgba(2,6,23,0.12)_68%,rgba(2,6,23,0.38)_100%)]" />
                </>
              )}

              <video
                ref={(el) => {
                  (localVideoRef as MutableRefObject<HTMLVideoElement | null>).current = el
                  if (el && localStream && el.srcObject !== localStream) {
                    el.srcObject = localStream
                    patchVideoPlayback(el)
                  }
                }}
                autoPlay
                muted
                playsInline
                className={`relative aspect-video w-full object-cover -scale-x-100 transition-opacity duration-300 scale-[1.03] [filter:saturate(1.04)_contrast(1.03)] ${
                  hasLocalVideo && isVideoEnabled ? 'opacity-100' : 'opacity-0'
                }`}
              />

              {(!isVideoEnabled || !hasLocalVideo) && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-800 text-white">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-700">
                    <VideoOff className="h-8 w-8 text-slate-500" />
                  </div>
                  <p className="mt-4 text-sm text-slate-400">Cámara desactivada</p>
                </div>
              )}

              {/* Name overlay on preview */}
              <div className="absolute bottom-3 left-3 rounded-md bg-slate-900/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                {localLabel}
              </div>
            </div>

            {/* Waiting message */}
            <div className="mt-6 text-center">
              <div className="inline-flex items-center gap-2 text-sm text-slate-400">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-slate-500"
                      animate={{ y: [0, -6, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                    />
                  ))}
                </div>
                Esperando al otro participante
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Local video PiP (when remote present) ── */}
      {firstRemote && (
        <LocalVideoPiP
          localVideoRef={localVideoRef}
          client={client}
          isVideoEnabled={isVideoEnabled}
          isAudioEnabled={isAudioEnabled}
          localLabel={localLabel}
        />
      )}

      {/* ── Screen share overlay ── */}
      {isScreenSharing && screenStream && (
        <div className="absolute left-4 top-16 z-10 overflow-hidden rounded-xl border border-am-doctor-400/30 bg-slate-900 shadow-xl sm:left-6 sm:top-20 h-[100px] w-[160px] sm:h-[120px] sm:w-[200px]">
          <video ref={screenShareRef as React.RefObject<HTMLVideoElement>} autoPlay muted playsInline className="h-full w-full object-contain" />
          <div className="absolute bottom-0 inset-x-0 flex items-center gap-1 bg-gradient-to-t from-slate-900/80 to-transparent px-2 py-1 text-[10px] font-medium text-am-doctor-300">
            <MonitorUp className="h-3 w-3" />
            Compartiendo
          </div>
        </div>
      )}
    </>
  )
}
