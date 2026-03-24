'use client'

import React, { useEffect, useRef, useState } from 'react'

export interface ProgressBarProps {
  value: number
  max: number
  variant?: 'default' | 'doctor' | 'success' | 'warning'
  showLabel?: boolean
  animate?: boolean
  className?: string
}

const gradients: Record<NonNullable<ProgressBarProps['variant']>, string> = {
  default: 'bg-gradient-to-r from-am-primary-400 to-am-primary-500',
  doctor:  'bg-gradient-to-r from-am-doctor-400 to-am-doctor-500',
  success: 'bg-gradient-to-r from-emerald-400 to-emerald-500',
  warning: 'bg-gradient-to-r from-amber-400 to-amber-500',
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max,
  variant = 'default',
  showLabel = false,
  animate = true,
  className = '',
}) => {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0
  const [width, setWidth] = useState(animate ? 0 : percentage)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!animate) return
    const timeout = setTimeout(() => setWidth(percentage), 100)
    return () => clearTimeout(timeout)
  }, [percentage, animate])

  return (
    <div className={className}>
      {showLabel && (
        <div className="flex justify-between mb-1.5">
          <span className="text-xs font-medium text-am-surface-600">{value}/{max}</span>
          <span className="text-xs font-medium text-am-surface-500">{Math.round(percentage)}%</span>
        </div>
      )}
      <div ref={ref} className="w-full rounded-full bg-am-surface-200 h-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-[600ms] ease-am-ease ${gradients[variant]}`}
          style={{ width: `${animate ? width : percentage}%` }}
        />
      </div>
    </div>
  )
}
