import { useState, useEffect, useRef, useCallback } from 'react'
import type { StreamQualityLevel } from '../webrtc-client'
import type { WebRTCClient } from '../webrtc-client'
import type { CloudflareCallsClient } from '../cloudflare-calls'
import type { TelemedicineDebugLevel } from '../debug'

const POOR_QUALITY_THRESHOLD_MS = 30_000
const REMOTE_MEDIA_TIMEOUT_MESSAGE = 'El video del otro participante está demorando. Podés continuar solo con audio.'

export { REMOTE_MEDIA_TIMEOUT_MESSAGE }

export interface UseCallQualityParams {
  client: WebRTCClient | CloudflareCallsClient | null
  callError: string | null
  setCallError: React.Dispatch<React.SetStateAction<string | null>>
  emitDebug: (level: TelemedicineDebugLevel, message: string, payload?: Record<string, unknown>) => void
}

export interface CallQualityState {
  qualityLevel: StreamQualityLevel
  setQualityLevel: React.Dispatch<React.SetStateAction<StreamQualityLevel>>
  showAudioOnlySuggestion: boolean
  setShowAudioOnlySuggestion: React.Dispatch<React.SetStateAction<boolean>>
  switchToAudioOnly: () => void
}

export function useCallQuality({
  client,
  callError,
  setCallError,
  emitDebug,
}: UseCallQualityParams): CallQualityState {
  const [qualityLevel, setQualityLevel] = useState<StreamQualityLevel>('unknown')
  const [showAudioOnlySuggestion, setShowAudioOnlySuggestion] = useState(false)
  const poorQualityStartRef = useRef<number | null>(null)

  useEffect(() => {
    if (qualityLevel === 'poor') {
      if (!poorQualityStartRef.current) {
        poorQualityStartRef.current = Date.now()
      } else if (Date.now() - poorQualityStartRef.current >= POOR_QUALITY_THRESHOLD_MS) {
        setShowAudioOnlySuggestion(true)
      }
    } else {
      poorQualityStartRef.current = null
      setShowAudioOnlySuggestion(false)
    }
  }, [qualityLevel])

  const switchToAudioOnly = useCallback(() => {
    if (!client) return
    client.toggleVideo(false)
    setShowAudioOnlySuggestion(false)
    if (callError === REMOTE_MEDIA_TIMEOUT_MESSAGE) {
      setCallError(null)
    }
    emitDebug('info', 'Switched to audio-only mode due to poor connection')
  }, [callError, client, emitDebug, setCallError])

  return {
    qualityLevel,
    setQualityLevel,
    showAudioOnlySuggestion,
    setShowAudioOnlySuggestion,
    switchToAudioOnly,
  }
}
