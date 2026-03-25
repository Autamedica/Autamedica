'use client'

import { Loader2 } from 'lucide-react'

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
  roomId,
}: ConnectingOverlayProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-neutral-800 via-neutral-900 to-neutral-950">
      <div className="relative mb-6">
        <div className={`absolute inset-0 animate-pulse-ring rounded-full ${accentColor === 'violet' ? 'bg-violet-500/20' : 'bg-sky-500/20'}`} />
        <div className={`absolute inset-[-8px] animate-pulse-ring rounded-full ${accentColor === 'violet' ? 'bg-violet-500/10' : 'bg-sky-500/10'}`} style={{ animationDelay: '0.5s' }} />
        <div className={`flex h-20 w-20 items-center justify-center rounded-full ${accentColor === 'violet' ? 'bg-violet-600/20' : 'bg-sky-600/20'}`}>
          <Loader2 className={`h-10 w-10 animate-spin ${accentColor === 'violet' ? 'text-violet-400' : 'text-sky-400'}`} />
        </div>
      </div>
      {isRetrying ? (
        <>
          <p className="text-lg font-semibold text-white">Reconectando...</p>
          <p className="mt-1.5 text-sm text-amber-400">Intento {retryAttempt} de {maxRetries}</p>
        </>
      ) : (
        <>
          <p className="text-lg font-semibold text-white">Conectando...</p>
          <p className="mt-1.5 text-sm text-slate-400">Sala: {roomId}</p>
        </>
      )}
    </div>
  )
}
