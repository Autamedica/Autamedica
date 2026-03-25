'use client'

import { AlertTriangle, WifiOff, X } from 'lucide-react'
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

export interface QualityOverlaysProps {
  showAudioOnlySuggestion: boolean
  onSwitchAudioOnly: () => void
  onDismissSuggestion: () => void
  callError: string | null
  isTestRoom: boolean
  showControls: boolean
  qualityLevel: StreamQualityLevel
}

export function QualityOverlays({
  showAudioOnlySuggestion,
  onSwitchAudioOnly,
  onDismissSuggestion,
  callError,
  isTestRoom,
  showControls,
  qualityLevel,
}: QualityOverlaysProps) {
  return (
    <>
      {/* Error toast */}
      {callError && (
        <div className="absolute inset-x-0 top-14 z-30 flex justify-center px-4">
          <div className="rounded-xl bg-red-500/90 px-4 py-2 text-sm shadow-lg ring-1 ring-red-400/20 backdrop-blur-sm">
            {callError}
          </div>
        </div>
      )}

      {/* Test badge */}
      {isTestRoom && (
        <div className="absolute left-4 top-14 z-30">
          <div className="rounded-full border border-amber-400/20 bg-black/30 px-2.5 py-0.5 text-[10px] text-amber-400/60 backdrop-blur-xl">
            Test
          </div>
        </div>
      )}

      {/* Audio-only suggestion */}
      {showAudioOnlySuggestion && (
        <div className="absolute left-4 bottom-28 z-30 flex max-w-sm items-center gap-3 rounded-2xl bg-amber-950/80 px-4 py-3 text-sm shadow-lg ring-1 ring-amber-500/10 backdrop-blur-xl">
          <AlertTriangle className="h-5 w-5 text-amber-300 shrink-0" />
          <div>
            <p className="text-amber-100 font-medium">Conexion inestable</p>
            <p className="text-amber-200/70 text-xs">Solo audio puede mejorar la experiencia</p>
          </div>
          <button
            onClick={onSwitchAudioOnly}
            className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 transition-colors"
          >
            Solo audio
          </button>
          <button
            onClick={onDismissSuggestion}
            className="shrink-0 rounded-full p-1 text-amber-300 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Quality badge (poor/fair) */}
      {(qualityLevel === 'poor' || qualityLevel === 'fair') && !showAudioOnlySuggestion && (
        <div className={`absolute left-4 bottom-24 z-20 flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1 text-[11px] backdrop-blur-xl ${showControls ? '' : ''}`}>
          <WifiOff className={`h-3 w-3 ${qualityColor[qualityLevel]}`} />
          <span className={qualityColor[qualityLevel]}>Conexion {qualityLabel[qualityLevel].toLowerCase()}</span>
        </div>
      )}
    </>
  )
}
