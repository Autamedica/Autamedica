'use client'

import { motion, AnimatePresence } from 'framer-motion'
import type { RefObject } from 'react'
import { User, ShieldCheck } from 'lucide-react'

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
  client: any
  isVideoEnabled: boolean
  isAudioEnabled: boolean
  isScreenSharing: boolean
  screenStream: MediaStream | null
  userName?: string
  accentColor: string
  callError: string | null
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
}: ActiveCallLayoutProps) {
  const participants = Array.from(remoteUsers.values())
  const hasRemote = participants.length > 0
  const remote = participants[0] // 1-on-1 focus

  return (
    <div className="relative h-full w-full bg-am-surface-900">
      <div className="absolute inset-0 flex items-center justify-center p-4">
        
        {/* ── Main Video Container ── */}
        <div className="relative h-full w-full max-w-7xl overflow-hidden rounded-[40px] border border-white/5 bg-am-surface-800 shadow-am-2xl">
          
          {/* ── Screen Share or Remote Video ── */}
          <div className="h-full w-full">
            {isScreenSharing && screenStream ? (
              <video
                ref={screenShareRef as any}
                autoPlay
                playsInline
                className="h-full w-full object-contain bg-black"
              />
            ) : hasRemote && remote?.stream ? (
              <video
                ref={(el) => {
                  if (el) remoteVideosRef.current?.set(remote.userId, el)
                }}
                autoPlay
                playsInline
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-am-surface-800">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-am-surface-700/50 text-am-surface-400">
                  <User size={48} />
                </div>
                <p className="text-am-surface-300 font-medium animate-pulse">Esperando al participante...</p>
              </div>
            )}
          </div>

          {/* ── Remote Identity Overlay ── */}
          {hasRemote && (
            <div className="absolute top-8 left-8 flex items-center gap-3 rounded-full bg-am-surface-900/40 px-5 py-2.5 backdrop-blur-xl border border-white/10">
              <div className="h-2 w-2 rounded-full bg-am-success shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <span className="text-sm font-semibold tracking-tight text-am-surface-50">
                {remote.userName || 'Paciente'}
              </span>
            </div>
          )}

          {/* ── Security Badge ── */}
          <div className="absolute top-8 right-8 flex items-center gap-2 rounded-full bg-am-surface-900/20 px-4 py-2 backdrop-blur-sm">
            <ShieldCheck size={14} className="text-am-primary-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-am-surface-300">End-to-End Encrypted</span>
          </div>
        </div>

        {/* ── Local Picture-in-Picture ── */}
        <motion.div
          drag
          dragConstraints={{ left: -400, right: 400, top: -300, bottom: 300 }}
          className="absolute bottom-32 right-12 z-40 h-48 aspect-video overflow-hidden rounded-3xl border-2 border-white/10 bg-am-surface-800 shadow-am-xl cursor-grab active:cursor-grabbing"
        >
          {isVideoEnabled ? (
            <video
              ref={localVideoRef as any}
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
          <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg bg-black/40 px-2 py-1 backdrop-blur-md">
            <span className="text-[10px] font-bold text-white uppercase">{userName || 'Tú'}</span>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
