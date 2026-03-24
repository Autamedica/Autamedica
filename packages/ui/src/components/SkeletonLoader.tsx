'use client'

import React from 'react'

export interface SkeletonLoaderProps {
  variant?: 'card' | 'list-item' | 'stat-card' | 'text-block'
  count?: number
  className?: string
}

const SkeletonBar: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`rounded-lg am-skeleton ${className}`} />
)

function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-am-surface-200 bg-white p-6">
      <div className="flex items-center gap-3 mb-4">
        <SkeletonBar className="h-10 w-10 rounded-xl" />
        <div className="flex-1 space-y-2">
          <SkeletonBar className="h-4 w-3/4" />
          <SkeletonBar className="h-3 w-1/2" />
        </div>
      </div>
      <SkeletonBar className="h-3 w-full mb-2" />
      <SkeletonBar className="h-3 w-5/6" />
    </div>
  )
}

function ListItemSkeleton() {
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <SkeletonBar className="h-11 w-11 rounded-xl" />
      <div className="flex-1 space-y-2">
        <SkeletonBar className="h-4 w-1/3" />
        <SkeletonBar className="h-3 w-1/2" />
      </div>
      <SkeletonBar className="h-5 w-16 rounded-full" />
    </div>
  )
}

function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-am-surface-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <SkeletonBar className="h-10 w-10 rounded-xl" />
        <div className="space-y-2">
          <SkeletonBar className="h-3 w-16" />
          <SkeletonBar className="h-6 w-10" />
        </div>
      </div>
    </div>
  )
}

function TextBlockSkeleton() {
  return (
    <div className="space-y-3">
      <SkeletonBar className="h-4 w-full" />
      <SkeletonBar className="h-4 w-5/6" />
      <SkeletonBar className="h-4 w-3/4" />
    </div>
  )
}

const skeletonMap = {
  'card': CardSkeleton,
  'list-item': ListItemSkeleton,
  'stat-card': StatCardSkeleton,
  'text-block': TextBlockSkeleton,
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  variant = 'card',
  count = 1,
  className = '',
}) => {
  const Component = skeletonMap[variant]

  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <Component key={i} />
      ))}
    </div>
  )
}
