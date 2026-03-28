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
}: ConnectingOverlayProps) {
  const dotColor = accentColor === 'violet' ? 'bg-violet-500' : 'bg-sky-500'
  const spinColor = accentColor === 'violet' ? 'text-violet-400' : 'text-sky-400'

  return (
    <div className="flex h-full flex-col items-center justify-center bg-[#0a0a0a]">
      {/* Spinner with pulse rings */}
      <div className="relative mb-8">
        <div className={`absolute inset-[-16px] rounded-full ${dotColor} opacity-10 animate-ping`} style={{ animationDuration: '2s' }} />
        <div className={`absolute inset-[-8px] rounded-full ${dotColor} opacity-5 animate-ping`} style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/5 backdrop-blur-sm">
          <Loader2 className={`h-8 w-8 animate-spin ${spinColor}`} />
        </div>
      </div>

      <p className="text-base font-semibold text-white">
        {isRetrying ? 'Reconectando...' : 'Conectando...'}
      </p>

      {isRetrying && (
        <div className="mt-3 flex items-center gap-2">
          {Array.from({ length: maxRetries }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 w-6 rounded-full transition-all ${
                i < retryAttempt ? dotColor : 'bg-white/10'
              }`}
            />
          ))}
        </div>
      )}

      <p className="mt-3 text-sm text-slate-500">
        {isRetrying ? `Intento ${retryAttempt} de ${maxRetries}` : 'Estableciendo conexión segura'}
      </p>
    </div>
  )
}
