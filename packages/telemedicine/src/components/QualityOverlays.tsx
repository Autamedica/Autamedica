'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, WifiOff, X } from 'lucide-react'
import type { StreamQualityLevel } from '../webrtc-client'

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
  // Auto-dismiss error after 8s
  const [showError, setShowError] = useState(false)
  useEffect(() => {
    if (callError) {
      setShowError(true)
      const t = setTimeout(() => setShowError(false), 8000)
      return () => clearTimeout(t)
    }
    setShowError(false)
  }, [callError])

  return (
    <>
      {/* Error toast — slides in from top */}
      {callError && showError && (
        <div className="absolute inset-x-0 top-14 z-30 flex justify-center px-4 animate-in slide-in-from-top-2 duration-300">
          <div className="flex max-w-md items-start gap-3 rounded-xl border border-red-400/20 bg-neutral-900/95 px-4 py-3 text-sm text-white shadow-2xl backdrop-blur-xl">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div className="flex-1">
              <p className="font-medium text-red-300">{callError}</p>
            </div>
            <button onClick={() => setShowError(false)} className="shrink-0 text-slate-400 hover:text-white transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Test badge */}
      {isTestRoom && (
        <div className="absolute left-4 top-14 z-30">
          <div className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-400 backdrop-blur-sm">
            TEST
          </div>
        </div>
      )}

      {/* Audio-only suggestion */}
      {showAudioOnlySuggestion && (
        <div className="absolute bottom-28 left-4 z-30 max-w-sm animate-in slide-in-from-left-2 duration-300">
          <div className="flex items-center gap-3 rounded-xl border border-amber-400/15 bg-neutral-900/95 px-4 py-3 text-sm shadow-xl backdrop-blur-xl">
            <WifiOff className="h-5 w-5 shrink-0 text-amber-400" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-white">Conexión inestable</p>
              <p className="mt-0.5 text-xs text-slate-400">Solo audio puede mejorar la experiencia</p>
            </div>
            <button
              onClick={onSwitchAudioOnly}
              className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 transition-colors"
            >
              Solo audio
            </button>
            <button
              onClick={onDismissSuggestion}
              className="shrink-0 rounded-full p-1 text-slate-400 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Quality warning badge */}
      {(qualityLevel === 'poor' || qualityLevel === 'fair') && !showAudioOnlySuggestion && showControls && (
        <div className="absolute bottom-28 left-4 z-20">
          <div className={`flex items-center gap-1.5 rounded-lg bg-black/50 px-2.5 py-1 text-[11px] backdrop-blur-sm ${
            qualityLevel === 'poor' ? 'text-red-400' : 'text-amber-400'
          }`}>
            <WifiOff className="h-3 w-3" />
            Conexión {qualityLevel === 'poor' ? 'débil' : 'regular'}
          </div>
        </div>
      )}
    </>
  )
}
