import type { JSX, ReactNode } from 'react'
export function Card({ children, className = '' }: { children: ReactNode; className?: string }): JSX.Element {
  return <div className={`rounded-lg border bg-white shadow-sm ${className}`}>{children}</div>
}
export function CardContent({ children, className = '' }: { children: ReactNode; className?: string }): JSX.Element {
  return <div className={`p-4 ${className}`}>{children}</div>
}
