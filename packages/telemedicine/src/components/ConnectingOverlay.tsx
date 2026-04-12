'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { pulseRing, pulseRingDelayed, springSnappy } from './animation-presets'

export interface ConnectingOverlayProps {
  isRetrying: boolean
  retryAttempt: number
  maxRetries: number
  accentColor: 'violet' | 'sky'
  roomId: string
}

export function ConnectingOverlay({
  isRetrying,
  retryAttempt,
  maxRetries,
  accentColor,
}: ConnectingOverlayProps) {
  const dotColor = accentColor === 'violet' ? 'bg-violet-500' : 'bg-sky-500'
  const spinColor = accentColor === 'violet' ? 'text-violet-400' : 'text-sky-400'

  return (
    <motion.div
      className="flex h-full flex-col items-center justify-center bg-[#0a0a0a]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Spinner with animated pulse rings */}
      <div className="relative mb-8">
        <motion.div
          className={`absolute inset-[-16px] rounded-full ${dotColor}`}
          variants={pulseRing}
          animate="pulse"
        />
        <motion.div
          className={`absolute inset-[-8px] rounded-full ${dotColor}`}
          variants={pulseRingDelayed}
          animate="pulse"
        />
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5 backdrop-blur-sm">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          >
            <svg className={`h-8 w-8 ${spinColor}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
            </svg>
          </motion.div>
        </div>
      </div>

      <motion.p
        className="text-base font-semibold text-white"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, ...springSnappy }}
      >
        {isRetrying ? 'Reconectando...' : 'Conectando...'}
      </motion.p>

      <AnimatePresence>
        {isRetrying && (
          <motion.div
            className="mt-3 flex items-center gap-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            {Array.from({ length: maxRetries }).map((_, i) => (
              <motion.div
                key={i}
                className={`h-1.5 w-6 rounded-full ${
                  i < retryAttempt ? dotColor : 'bg-white/10'
                }`}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 0.1, type: 'spring', stiffness: 300, damping: 20 }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.p
        className="mt-3 text-sm text-slate-500"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        {isRetrying ? `Intento ${retryAttempt} de ${maxRetries}` : 'Estableciendo conexión segura'}
      </motion.p>
    </motion.div>
  )
}
