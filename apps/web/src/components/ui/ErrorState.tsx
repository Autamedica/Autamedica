import type { JSX } from 'react'
export function ErrorState({ title, message = 'Error', onRetry }: { title?: string; message?: string; onRetry?: () => void }): JSX.Element {
  return <div className="flex flex-col items-center justify-center py-8">{title && <p className="text-sm font-medium text-red-700">{title}</p>}<p className="text-sm text-red-600">{message}</p>{onRetry && <button onClick={onRetry} className="mt-2 text-sm underline">Reintentar</button>}</div>
}
