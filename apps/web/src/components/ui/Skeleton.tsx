import type { JSX } from 'react'

interface SkeletonProps {
  className?: string
  /** Render a circle instead of rectangle */
  circle?: boolean
}

export function Skeleton({ className = '', circle }: SkeletonProps): JSX.Element {
  return (
    <div
      className={`animate-pulse rounded-lg bg-gray-100 ${circle ? '!rounded-full' : ''} ${className}`}
      aria-hidden="true"
    />
  )
}

/** Pre-built skeleton for a card with avatar + 2 lines */
export function SkeletonCard({ className = '' }: { className?: string }): JSX.Element {
  return (
    <div className={`rounded-xl border border-gray-100 p-4 ${className}`}>
      <div className="flex items-center gap-3">
        <Skeleton circle className="h-10 w-10 shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  )
}

/** Skeleton for the patient dashboard sections */
export function SkeletonDashboard(): JSX.Element {
  return (
    <div className="space-y-6 px-5 pt-5" aria-busy="true" aria-label="Cargando...">
      {/* Hero card skeleton */}
      <Skeleton className="h-[180px] w-full rounded-2xl" />
      {/* Progress row */}
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-[88px] rounded-xl" />
        <Skeleton className="h-[88px] rounded-xl" />
        <Skeleton className="h-[88px] rounded-xl" />
      </div>
      {/* Actions grid */}
      <div>
        <Skeleton className="mb-3 h-3 w-24" />
        <div className="grid grid-cols-2 gap-3">
          {[1,2,3,4].map(i => (
            <Skeleton key={i} className="h-[72px] rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}
