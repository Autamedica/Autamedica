'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Clock, Users } from 'lucide-react'
import type { StreamQualityLevel } from '../webrtc-client'
import type { CallSessionPhase } from '../runtime/call-session-phase'
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
  participantCount: number
  isRecording: boolean
  showControls: boolean
}

export function CallTopBar({
  phase, qualityLevel, formattedDuration, participantCount, isRecording, showControls,
}: CallTopBarProps) {
  const isConnected = phase === 'peer-ready'
  const connectionDotColor = isConnected
    ? 'bg-emerald-400'
    : phase === 'room-ready' ? 'bg-sky-400' : phase === 'joining' ? 'bg-amber-400' : 'bg-red-400'
  const shouldPulse = !isConnected && phase !== 'prejoin'

  const statusLabel = isConnected
    ? 'En consulta'
    : phase === 'room-ready' ? 'Esperando participante'
    : phase === 'joining' ? 'Conectando...' : 'Sin conexión'

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

          <div className="relative flex items-center justify-between px-4 pt-3 sm:px-6 sm:pt-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-xl">
                <motion.span
                  className={`h-2 w-2 rounded-full ${connectionDotColor}`}
                  animate={shouldPulse ? { scale: [1, 1.4, 1], opacity: [1, 0.5, 1] } : {}}
                  transition={shouldPulse ? { duration: 1.5, repeat: Infinity } : {}}
                />
                <span>{statusLabel}</span>
              </div>
              {qualityLevel !== 'unknown' && (
                <div className="hidden items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1.5 backdrop-blur-xl sm:flex">
                  <QualityBars level={qualityLevel} />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <AnimatePresence>
                {isRecording && (
                  <motion.div
                    className="flex items-center gap-1.5 rounded-full bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-300 backdrop-blur-xl ring-1 ring-red-400/20"
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
                <div className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-xs text-white backdrop-blur-xl">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  <span className="font-mono tabular-nums">{formattedDuration}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-xs text-white backdrop-blur-xl">
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
