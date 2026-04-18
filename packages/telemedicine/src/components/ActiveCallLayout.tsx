'use client'

import { motion } from 'framer-motion'
import { useEffect, useMemo, useState, type RefObject } from 'react'
import { User, ShieldCheck, VideoOff, Loader2 } from 'lucide-react'

interface RemoteUser {
  userId: string
  userType: string
  userName?: string
  stream?: MediaStream
}

export interface ActiveCallLayoutProps {
  remoteUsers: Map<string, RemoteUser>
  remoteVideosRef: RefObject<Map<string, HTMLVideoElement>>
  localVideoRef: RefObject<HTMLVideoElement | null>
  screenShareRef: RefObject<HTMLVideoElement | null>
  client: unknown
  isVideoEnabled: boolean
  isAudioEnabled: boolean
  isScreenSharing: boolean
  screenStream: MediaStream | null
  userName?: string
  accentColor: string
  callError: string | null
  /** Remote peers whose session dropped but are within the auto-heal window. */
  reconnectingPeers?: Set<string>
}

/**
 * Two-letter initials from a name. Falls back to "?" when nothing usable
 * is available.
 */
function initialsFromName(name: string | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Tracks whether the remote peer is currently publishing a usable video
 * track. Re-evaluates on mute/unmute events so the avatar fallback
 * appears instantly when the peer turns their camera off and disappears
 * as soon as frames resume.
 */
function useHasLiveVideo(stream: MediaStream | undefined): boolean {
  const [hasLive, setHasLive] = useState<boolean>(() => {
    if (!stream) return false
    return stream.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted)
  })

  useEffect(() => {
    if (!stream) {
      setHasLive(false)
      return
    }
    const videoTracks = stream.getVideoTracks()
    const evaluate = () => {
      setHasLive(videoTracks.some((t) => t.readyState === 'live' && !t.muted))
    }
    evaluate()
    const listeners: Array<() => void> = []
    videoTracks.forEach((t) => {
      const onMute = () => evaluate()
      const onUnmute = () => evaluate()
      const onEnded = () => evaluate()
      t.addEventListener('mute', onMute)
      t.addEventListener('unmute', onUnmute)
      t.addEventListener('ended', onEnded)
      listeners.push(() => {
        t.removeEventListener('mute', onMute)
        t.removeEventListener('unmute', onUnmute)
        t.removeEventListener('ended', onEnded)
      })
    })
    return () => listeners.forEach((off) => off())
  }, [stream])

  return hasLive
}

export function ActiveCallLayout({
  remoteUsers,
  remoteVideosRef,
  localVideoRef,
  screenShareRef,
  isVideoEnabled,
  isScreenSharing,
  screenStream,
  userName,
  reconnectingPeers,
}: ActiveCallLayoutProps) {
  const participants = useMemo(() => Array.from(remoteUsers.values()), [remoteUsers])
  const hasRemote = participants.length > 0
  // Prefer a participant that already has a live stream; falls back to the
  // first entry while the stream is still on its way so the placeholder
  // keeps working. (#322)
  const remote = participants.find((p) => p.stream) ?? participants[0]
  const remoteHasLiveVideo = useHasLiveVideo(remote?.stream)
  const remoteDisplayName = remote?.userName && remote.userName !== remote.userId
    ? remote.userName
    : remote?.userType === 'doctor'
      ? 'Médico'
      : 'Paciente'

  const isReconnecting =
    !hasRemote && reconnectingPeers !== undefined && reconnectingPeers.size > 0

  return (
    <div className="relative h-full w-full bg-am-surface-900 overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center p-0 sm:p-4">
        {/* ── Main Video Container ── */}
        <div className="relative h-full w-full max-w-7xl sm:h-[92%] overflow-hidden sm:rounded-[40px] border-0 sm:border border-white/5 bg-am-surface-800 shadow-am-2xl">
          {/* ── Screen Share or Remote Video ── */}
          <div className="h-full w-full">
            {isScreenSharing && screenStream ? (
              <video
                ref={screenShareRef as RefObject<HTMLVideoElement>}
                autoPlay
                playsInline
                className="h-full w-full object-contain bg-black"
              />
            ) : hasRemote && remote?.stream && remoteHasLiveVideo ? (
              <video
                ref={(el) => {
                  if (!el) return
                  remoteVideosRef.current?.set(remote.userId, el)
                  if (remote.stream && el.srcObject !== remote.stream) {
                    el.srcObject = remote.stream
                  }
                }}
                autoPlay
                playsInline
                className="h-full w-full object-cover"
              />
            ) : hasRemote && remote ? (
              // Peer present (stream delivered or recvonly transceiver live)
              // but no video frames — camera off or still warming up.
              <RemoteAvatarFallback
                initials={initialsFromName(remote.userName ?? remoteDisplayName)}
                label={remoteDisplayName}
                subtitle="Cámara desactivada"
                icon="video-off"
              />
            ) : isReconnecting ? (
              <RemoteAvatarFallback
                initials="..."
                label="Reconectando"
                subtitle="El otro participante se está reconectando..."
                icon="spinner"
              />
            ) : (
              <RemoteAvatarFallback
                initials="?"
                label="Esperando al participante"
                subtitle="La consulta iniciará cuando el otro participante se conecte"
                icon="user"
              />
            )}
          </div>

          {/* ── Consolidated Top Bar (single pill) ── */}
          <div className="absolute top-4 sm:top-8 left-4 sm:left-8 right-4 sm:right-8 flex items-start justify-between gap-3 pointer-events-none">
            {hasRemote && (
              <div className="flex items-center gap-3 rounded-full bg-am-surface-900/60 px-4 sm:px-5 py-2 sm:py-2.5 backdrop-blur-xl border border-white/10 pointer-events-auto">
                <div className="h-2 w-2 rounded-full bg-am-success shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <span className="text-xs sm:text-sm font-semibold tracking-tight text-am-surface-50">
                  {remoteDisplayName}
                </span>
                {!remoteHasLiveVideo && remote?.stream && (
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-am-surface-300">
                    <VideoOff size={10} />
                    cám. off
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 rounded-full bg-am-surface-900/30 px-3 sm:px-4 py-1.5 sm:py-2 backdrop-blur-sm pointer-events-auto">
              <ShieldCheck size={12} className="text-am-primary-400" />
              <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-am-surface-300">
                Encrypted
              </span>
            </div>
          </div>
        </div>

        {/* ── Local Picture-in-Picture ── */}
        <motion.div
          drag
          dragMomentum={false}
          dragConstraints={{ left: -1000, right: 1000, top: -1000, bottom: 1000 }}
          className="absolute bottom-28 md:bottom-32 right-4 md:right-12 z-40 w-32 sm:w-48 aspect-video overflow-hidden rounded-2xl sm:rounded-3xl border-2 border-white/10 bg-am-surface-800 shadow-am-xl cursor-grab active:cursor-grabbing"
        >
          {isVideoEnabled ? (
            <video
              ref={localVideoRef as RefObject<HTMLVideoElement>}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover mirror"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-am-surface-700">
              <User size={24} className="text-am-surface-400" />
            </div>
          )}
          <div className="absolute bottom-2 left-2 flex items-center gap-2 rounded-lg bg-black/40 px-2 py-0.5 backdrop-blur-md">
            <span className="text-[8px] sm:text-[10px] font-bold text-white uppercase">{userName || 'Tú'}</span>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

interface RemoteAvatarFallbackProps {
  initials: string
  label: string
  subtitle?: string
  icon: 'user' | 'spinner' | 'video-off'
}

function RemoteAvatarFallback({ initials, label, subtitle, icon }: RemoteAvatarFallbackProps) {
  const IconNode = icon === 'spinner'
    ? <Loader2 size={28} className="text-am-surface-300 animate-spin" />
    : icon === 'video-off'
      ? <VideoOff size={28} className="text-am-surface-300" />
      : <User size={40} className="text-am-surface-300" />

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 bg-am-surface-800 px-6 text-center">
      <div className="relative flex h-28 w-28 md:h-32 md:w-32 items-center justify-center rounded-full bg-gradient-to-br from-am-surface-700 to-am-surface-600 text-am-surface-50 shadow-lg">
        {initials && initials !== '?' && initials !== '...' ? (
          <span className="text-3xl md:text-4xl font-semibold tracking-wide">{initials}</span>
        ) : (
          IconNode
        )}
        {icon === 'spinner' && initials === '...' && (
          <Loader2 size={20} className="absolute -bottom-2 -right-2 text-am-primary-400 animate-spin" />
        )}
      </div>
      <div className="flex flex-col items-center gap-1.5 max-w-md">
        <p className="text-am-surface-100 font-semibold text-base md:text-lg">{label}</p>
        {subtitle && (
          <p className="text-am-surface-400 text-xs md:text-sm leading-relaxed">{subtitle}</p>
        )}
      </div>
    </div>
  )
}
