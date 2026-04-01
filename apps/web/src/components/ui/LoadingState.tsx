import { Loader2 } from 'lucide-react'
import type { JSX } from 'react'

interface LoadingStateProps {
  message?: string
  size?: 'sm' | 'md' | 'lg'
}

export function LoadingState({ message = 'Cargando...', size = 'md' }: LoadingStateProps): JSX.Element {
  const iconSize = size === 'sm' ? 'h-5 w-5' : size === 'lg' ? 'h-10 w-10' : 'h-7 w-7'
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12" role="status" aria-label={message}>
      <Loader2 className={`${iconSize} animate-spin text-sky-500`} />
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  )
}
