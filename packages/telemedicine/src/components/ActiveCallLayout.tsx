'use client'

import type { MutableRefObject, RefObject } from 'react'
import {
  VideoOff,
  MicOff,
  Loader2,
  Users,
  ScreenShare,
  UserCircle,
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
  accentColor,
  callError,
}: ActiveCallLayoutProps) {
  const firstRemote = remoteUsers.size > 0 ? Array.from(remoteUsers.entries())[0] : null

  return (
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
                  </div>
                )}

                {/* Remote user label */}
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
          <p className="mt-1.5 text-sm text-slate-500">La consulta comenzara cuando se conecte el otro participante</p>
          {!callError && (
            <div className="mt-4 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-slate-500">Tu conexion esta activa</span>
            </div>
          )}
        </div>
      )}

      {/* Local video PiP (bottom-right) */}
      <div className="absolute bottom-28 right-4 z-10 h-36 w-52 overflow-hidden rounded-2xl bg-slate-800 shadow-2xl shadow-black/50 ring-1 ring-white/15 transition-all hover:scale-[1.03] hover:ring-white/30 sm:h-44 sm:w-64 md:right-6">
        <video
          ref={(el) => {
            (localVideoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el
            if (el && client) {
              const s = client.getLocalStream()
              if (s && el.srcObject !== s) {
                el.srcObject = s
                patchVideoPlayback(el)
              }
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
        {!isAudioEnabled && (
          <div className="absolute bottom-0 inset-x-0 flex items-center justify-end bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
            <MicOff className="h-3 w-3 text-red-400" />
          </div>
        )}
      </div>

      {/* Screen share overlay */}
      {isScreenSharing && screenStream && (
        <div className="absolute left-4 top-16 z-10 h-36 w-52 overflow-hidden rounded-xl border border-blue-500/40 bg-black shadow-lg">
          <video ref={screenShareRef as React.RefObject<HTMLVideoElement>} autoPlay muted playsInline className="h-full w-full object-contain" />
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
            <span className="flex items-center gap-1 text-xs">
              <ScreenShare className="h-3 w-3" /> Compartiendo
            </span>
          </div>
        </div>
      )}
    </>
  )
}
