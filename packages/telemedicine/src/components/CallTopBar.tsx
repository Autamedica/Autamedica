'use client'

import { Clock, Users } from 'lucide-react'
import type { StreamQualityLevel } from '../webrtc-client'
import type { CallSessionPhase } from '../runtime/call-session-phase'

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
        <div
          key={i}
          className={`w-[3px] rounded-full transition-all ${
            i <= bars ? 'bg-current' : 'bg-white/15'
          }`}
          style={{ height: `${6 + i * 3}px` }}
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
  phase,
  qualityLevel,
  formattedDuration,
  participantCount,
  isRecording,
  showControls,
}: CallTopBarProps) {
  const isConnected = phase === 'peer-ready'
  const connectionDot = isConnected
    ? 'bg-emerald-400'
    : phase === 'room-ready'
      ? 'bg-sky-400 animate-pulse'
      : phase === 'joining'
        ? 'bg-amber-400 animate-pulse'
        : 'bg-red-400'

  const statusLabel = isConnected
    ? 'En consulta'
    : phase === 'room-ready'
      ? 'Esperando participante'
      : phase === 'joining'
        ? 'Conectando...'
        : 'Sin conexión'

  return (
    <div
      className={`absolute inset-x-0 top-0 z-20 transition-all duration-500 ${
        showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Top gradient for readability */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />

      <div className="relative flex items-center justify-between px-4 pt-3 sm:px-6 sm:pt-4">
        {/* Left: connection status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-xl">
            <span className={`h-2 w-2 rounded-full ${connectionDot}`} />
            <span>{statusLabel}</span>
          </div>
          {qualityLevel !== 'unknown' && (
            <div className="hidden items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1.5 backdrop-blur-xl sm:flex">
              <QualityBars level={qualityLevel} />
            </div>
          )}
        </div>

        {/* Right: timer + participants + recording */}
        <div className="flex items-center gap-2">
          {isRecording && (
            <div className="flex items-center gap-1.5 rounded-full bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-300 backdrop-blur-xl ring-1 ring-red-400/20">
              <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
              <span className="hidden sm:inline">REC</span>
            </div>
          )}
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
    </div>
  )
}
