import type { JSX } from 'react'
export function LoadingState({ message = 'Cargando...' }: { message?: string }): JSX.Element {
  return <div className="flex items-center justify-center py-8"><span className="text-sm text-gray-500">{message}</span></div>
}
