'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Clock, Users } from 'lucide-react'
import type { StreamQualityLevel } from '../webrtc-client'
import type { CallSessionPhase } from '../runtime/call-session-phase'
import type { CallSessionRuntime } from '../call-session/types'
import { topBarVariants, springSnappy } from './animation-presets'

const qualityConfig: Record<StreamQualityLevel, { color: string; bars: number }> = {
  excellent: { color: 'text-emerald-400', bars: 4 },
  good: { color: 'text-emerald-400', bars: 3 },
  fair: { color: 'text-amber-400', bars: 2 },
  poor: { color: 'text-red-400', bars: 1 },
  unknown: { color: 'text-slate-500', bars: 0 },
}

function QualityBars({ level }: { level: StreamQualityLevel }) {
  const { color, bars } = qualityConfig[level]
  return (
    <div className={`flex items-end gap-[2px] ${color}`} title={`Calidad: ${level}`}>
      {[1, 2, 3, 4].map((i) => (
        <motion.div
          key={i}
          className={`w-[3px] rounded-full ${i <= bars ? 'bg-current' : 'bg-white/15'}`}
          animate={{ height: `${6 + i * 3}px` }}
          transition={springSnappy}
        />
      ))}
    </div>
  )
}

export interface CallTopBarProps {
  phase: CallSessionPhase
  qualityLevel: StreamQualityLevel
  formattedDuration: string
  durationSeconds?: number
  participantCount: number
  isRecording: boolean
  showControls: boolean
  runtime?: CallSessionRuntime
}

const CALL_LIMIT_WARNING_SECONDS = 25 * 60
const CALL_LIMIT_MAX_SECONDS = 30 * 60

function parseFormattedDurationSeconds(formattedDuration: string): number {
  const parts = formattedDuration.split(':').map((part) => Number.parseInt(part, 10))
  if (parts.some((part) => Number.isNaN(part) || part < 0)) return 0
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 0
}

export function CallTopBar({
  phase, qualityLevel, formattedDuration, durationSeconds, participantCount, isRecording, showControls, runtime,
}: CallTopBarProps) {
  const isConnected = phase === 'media-live'
  const effectiveDurationSeconds = durationSeconds ?? parseFormattedDurationSeconds(formattedDuration)
  const isLimitReached = effectiveDurationSeconds >= CALL_LIMIT_MAX_SECONDS
  const isLimitWarning = !isLimitReached && effectiveDurationSeconds >= CALL_LIMIT_WARNING_SECONDS
  const timerPillClasses = isLimitReached
    ? 'bg-red-500/25 text-red-200 ring-1 ring-red-400/40'
    : isLimitWarning
      ? 'bg-amber-500/25 text-amber-200 ring-1 ring-amber-400/40'
      : 'bg-black/40 text-white'
  const timerIconClasses = isLimitReached
    ? 'text-red-300'
    : isLimitWarning
      ? 'text-amber-300'
      : 'text-slate-400'
  const timerTitle = isLimitReached
    ? 'Límite de 30 minutos alcanzado'
    : isLimitWarning
      ? 'Menos de 5 minutos para el límite de 30 min'
      : 'Duración máxima de consulta: 30 min'
  const connectionDotColor = isConnected
    ? 'bg-emerald-400'
    : phase === 'peer-ready' ? 'bg-cyan-400'
    : phase === 'room-ready' ? 'bg-sky-400'
    : phase === 'joining' ? 'bg-amber-400' : 'bg-red-400'
  const shouldPulse = !isConnected && phase !== 'prejoin'

  const statusLabel = isConnected
    ? 'En consulta'
    : phase === 'peer-ready' ? 'Conectando media...'
    : phase === 'room-ready' ? 'Esperando participante'
    : phase === 'joining' ? 'Conectando...' : 'Sin conexion'

  return (
    <AnimatePresence>
      {showControls && (
        <motion.div
          className="absolute inset-x-0 top-0 z-20"
          variants={topBarVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />

          <div className="relative flex min-w-0 items-center justify-start gap-2 px-3 pt-3 sm:justify-between sm:px-6 sm:pt-4">
            <div className="flex min-w-0 max-w-full flex-1 items-center gap-1.5 sm:gap-3">
              <div className="flex min-w-0 max-w-[calc(100vw-6.75rem)] items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-xl sm:max-w-none">
                <motion.span
                  className={`h-2 w-2 shrink-0 rounded-full ${connectionDotColor}`}
                  animate={shouldPulse ? { scale: [1, 1.4, 1], opacity: [1, 0.5, 1] } : {}}
                  transition={shouldPulse ? { duration: 1.5, repeat: Infinity } : {}}
                />
                <span className="min-w-0 truncate">{statusLabel}</span>
              </div>
              {runtime && (
                <div
                  className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider backdrop-blur-xl ${
                    runtime === 'cloudflare-calls'
                      ? 'bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-400/20'
                      : runtime === 'webrtc-p2p'
                        ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-400/20'
                        : 'bg-red-500/15 text-red-400 ring-1 ring-red-400/20'
                  }`}
                  title={
                    runtime === 'cloudflare-calls' ? 'Cloudflare Calls SFU'
                      : runtime === 'webrtc-p2p' ? 'WebRTC Peer-to-Peer'
                        : `Unsupported runtime: ${runtime}`
                  }
                >
                  {runtime === 'cloudflare-calls' ? 'SFU' : runtime === 'webrtc-p2p' ? 'P2P' : runtime.toUpperCase()}
                </div>
              )}
              {qualityLevel !== 'unknown' && (
                <div className="hidden items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1.5 backdrop-blur-xl sm:flex">
                  <QualityBars level={qualityLevel} />
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <AnimatePresence>
                {isRecording && (
                  <motion.div
                    className="flex items-center gap-1.5 rounded-full bg-red-500/20 px-2.5 py-1.5 text-xs font-semibold text-red-300 backdrop-blur-xl ring-1 ring-red-400/20 sm:px-3"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={springSnappy}
                  >
                    <motion.span
                      className="h-2 w-2 rounded-full bg-red-400"
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                    <span className="hidden sm:inline">REC</span>
                  </motion.div>
                )}
              </AnimatePresence>
              {isConnected && (
                <div
                  data-testid="call-duration-timer"
                  title={timerTitle}
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs backdrop-blur-xl sm:px-3 ${timerPillClasses}`}
                >
                  <Clock className={`h-3.5 w-3.5 shrink-0 ${timerIconClasses}`} />
                  <span className="font-mono tabular-nums">{formattedDuration}</span>
                  <span className="hidden font-mono text-[10px] opacity-70 sm:inline">/ 30:00</span>
                </div>
              )}
              <div className="hidden items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1.5 text-xs text-white backdrop-blur-xl sm:flex sm:px-3">
                <Users className="h-3.5 w-3.5 text-slate-400" />
                <span>{participantCount}</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
