import type { JSX, ReactNode } from 'react'
export function Badge({ children, className = '', variant: _variant }: { children: ReactNode; className?: string; variant?: string }): JSX.Element {
  return <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${className}`}>{children}</span>
}
