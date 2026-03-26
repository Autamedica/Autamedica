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
  isPeerReady: boolean
  qualityLevel: StreamQualityLevel
  formattedDuration: string
  participantCount: number
  isRecording: boolean
  showControls: boolean
}

export function CallTopBar({
  connectionState,
  isPeerReady,
  qualityLevel,
  formattedDuration,
  participantCount,
  isRecording,
  showControls,
}: CallTopBarProps) {
  const connectionLabel =
    isPeerReady
      ? 'Conectado'
      : connectionState === 'connected'
        ? 'Esperando'
        : connectionState === 'connecting'
        ? 'Conectando'
        : 'Inestable'

  const connectionDotClass =
    isPeerReady
      ? 'bg-emerald-400'
      : connectionState === 'connected'
        ? 'bg-sky-400'
        : connectionState === 'connecting'
        ? 'bg-amber-400'
        : 'bg-red-400'

  return (
    <div
      className={`absolute inset-x-0 top-0 z-20 px-4 pt-4 transition-all duration-500 ${
          showControls ? 'opacity-100' : 'opacity-95'
      }`}
    >
      <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-3">
        <div className="rounded-[24px] border border-white/10 bg-black/45 px-4 py-3 text-white shadow-2xl backdrop-blur-2xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
            {isPeerReady ? 'Consulta en vivo' : 'Sala preparada'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1.5">
              <span className={`h-2 w-2 rounded-full ${connectionDotClass} ${isPeerReady ? 'animate-pulse' : ''}`} />
              <span className="font-medium">{connectionLabel}</span>
            </span>
            {qualityLevel !== 'unknown' && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/6 px-3 py-1.5">
                <Wifi className={`h-3.5 w-3.5 ${qualityColor[qualityLevel]}`} />
                <span className={qualityColor[qualityLevel]}>
                  Calidad {qualityLabel[qualityLevel].toLowerCase()}
                </span>
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {isRecording && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-red-400/20 bg-red-500/20 px-3 py-2 text-[11px] font-semibold text-red-200 shadow-lg backdrop-blur-xl">
              <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
              Grabando
            </div>
          )}
          {isPeerReady && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-2 text-[11px] text-white shadow-lg backdrop-blur-xl">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              <span className="font-mono">{formattedDuration}</span>
            </div>
          )}
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-2 text-[11px] text-white shadow-lg backdrop-blur-xl">
            <Users className="h-3.5 w-3.5 text-slate-400" />
            <span>{participantCount} en sala</span>
          </div>
        </div>
      </div>
    </div>
  )
}
