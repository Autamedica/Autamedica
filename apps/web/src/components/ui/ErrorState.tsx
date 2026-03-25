import type { JSX } from 'react'
export function ErrorState({ message = 'Error', onRetry }: { message?: string; onRetry?: () => void }): JSX.Element {
  return <div className="flex flex-col items-center justify-center py-8"><p className="text-sm text-red-600">{message}</p>{onRetry && <button onClick={onRetry} className="mt-2 text-sm underline">Reintentar</button>}</div>
}
