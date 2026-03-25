'use client'

import { Clock, Users, Wifi } from 'lucide-react'
import type { StreamQualityLevel } from '../webrtc-client'

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

export interface CallTopBarProps {
  connectionState: string
  qualityLevel: StreamQualityLevel
  formattedDuration: string
  participantCount: number
  isRecording: boolean
  showControls: boolean
}

export function CallTopBar({
  qualityLevel,
  formattedDuration,
  participantCount,
  isRecording,
  showControls,
}: CallTopBarProps) {
  return (
    <div
      className={`absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-black/40 via-black/20 to-transparent px-4 py-3 transition-opacity duration-500 ${
        showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div className="flex items-center gap-2">
        {/* Connection + quality merged */}
        <div className="flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1 text-[11px] backdrop-blur-xl">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-medium">Conectado</span>
          {qualityLevel !== 'unknown' && qualityLevel !== 'good' && qualityLevel !== 'excellent' && (
            <>
              <span className="text-white/20">&middot;</span>
              <Wifi className={`h-3 w-3 ${qualityColor[qualityLevel]}`} />
              <span className={qualityColor[qualityLevel]}>{qualityLabel[qualityLevel]}</span>
            </>
          )}
        </div>
        {/* Recording indicator */}
        {isRecording && (
          <div className="flex items-center gap-1.5 rounded-full bg-red-500/30 px-3 py-1 text-[11px] backdrop-blur-xl">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="font-medium text-red-300">REC</span>
          </div>
        )}
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
          <span>{participantCount}</span>
        </div>
      </div>
    </div>
  )
}
