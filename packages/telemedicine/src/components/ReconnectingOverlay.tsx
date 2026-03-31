'use client'

import { useEffect, useState } from 'react'
import { Loader2, WifiOff } from 'lucide-react'

export interface ReconnectingOverlayProps {
  isReconnecting: boolean
  attempt: number
  maxAttempts: number
}

/**
 * Overlay sutil que se muestra en la parte superior del area de llamada
 * cuando WebRTC esta intentando reconectar (ICE restart).
 * Informativo sin causar panico.
 */
export function ReconnectingOverlay({ isReconnecting, attempt, maxAttempts }: ReconnectingOverlayProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isReconnecting) {
      setVisible(true)
      return
    }
    // Delay hide para que se vea el "reconectado" brevemente
    const timer = setTimeout(() => setVisible(false), 600)
    return () => clearTimeout(timer)
  }, [isReconnecting])

  if (!visible) return null

  return (
    <div
      className={`
        absolute top-0 left-0 right-0 z-50
        flex items-center justify-center gap-2
        px-4 py-2
        bg-amber-900/80 text-amber-100
        text-sm font-medium
        backdrop-blur-sm
        transition-all duration-300 ease-out
        ${isReconnecting ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}
      `}
    >
      {isReconnecting ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Reconectando...</span>
          {attempt > 1 && (
            <span className="text-amber-300 text-xs">
              Intento {attempt} de {maxAttempts}
            </span>
          )}
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          <span>Conexion restablecida</span>
        </>
      )}
    </div>
  )
}
