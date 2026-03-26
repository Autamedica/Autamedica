'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, X } from 'lucide-react'

interface OnboardingReminderProps {
  daysRemaining: number
}

export function OnboardingReminder({ daysRemaining }: OnboardingReminderProps) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const label = daysRemaining === 1
    ? 'Te queda 1 día'
    : `Te quedan ${daysRemaining} días`

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-lg shadow-amber-500/10"
      >
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-800">Completa tu perfil</p>
          <p className="text-xs text-amber-700">{label}</p>
        </div>
        <a
          href="/doctors/perfil"
          className="ml-2 shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-600"
        >
          Completar
        </a>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="ml-1 shrink-0 rounded-lg p-1 text-amber-400 transition-colors hover:bg-amber-100 hover:text-amber-700"
          aria-label="Cerrar recordatorio"
        >
          <X className="h-4 w-4" />
        </button>
      </motion.div>
    </AnimatePresence>
  )
}
