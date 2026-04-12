'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, WifiOff } from 'lucide-react'
import { springGentle } from './animation-presets'

export interface ReconnectingOverlayProps {
  isReconnecting: boolean
  attempt: number
  maxAttempts: number
}

/**
 * Overlay sutil en la parte superior del area de llamada
 * cuando WebRTC esta intentando reconectar (ICE restart).
 */
export function ReconnectingOverlay({ isReconnecting, attempt, maxAttempts }: ReconnectingOverlayProps) {
  return (
    <AnimatePresence>
      {isReconnecting && (
        <motion.div
          className="absolute top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 px-4 py-2 bg-amber-950/85 text-amber-50 text-sm font-medium backdrop-blur-sm"
          initial={{ y: '-100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-100%', opacity: 0 }}
          transition={springGentle}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          >
            <Loader2 className="h-4 w-4" />
          </motion.div>
          <span>Reconectando video</span>
          {attempt > 1 && (
            <motion.span
              className="text-amber-200 text-xs"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
            >
              Intento {attempt} de {maxAttempts}
            </motion.span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
