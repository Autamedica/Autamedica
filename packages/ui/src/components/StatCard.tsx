'use client'

import React, { useEffect, useState } from 'react'

export interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: number | string
  iconBgColor?: string
  iconColor?: string
  trend?: { value: number; direction: 'up' | 'down' | 'neutral' }
  placeholder?: boolean
  className?: string
}

function useCountUp(target: number, duration = 800): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (target === 0) return
    const start = performance.now()
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.round(eased * target))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [target, duration])

  return count
}

export const StatCard: React.FC<StatCardProps> = ({
  icon,
  label,
  value,
  iconBgColor = 'bg-am-primary-50',
  iconColor = 'text-am-primary-600',
  trend,
  placeholder = false,
  className = '',
}) => {
  const numericValue = typeof value === 'number' ? value : 0
  const animatedValue = useCountUp(typeof value === 'number' ? numericValue : 0)
  const displayValue = placeholder ? '\u2014' : typeof value === 'number' ? animatedValue : value

  return (
    <div className={`
      rounded-2xl border border-am-surface-200 bg-white p-4 shadow-am-xs
      transition-all duration-am-base ease-am-ease
      hover:-translate-y-0.5 hover:shadow-am-card-hover
      ${className}
    `}>
      <div className="flex items-center gap-3">
        <div className={`flex-shrink-0 rounded-xl ${iconBgColor} p-2.5`}>
          <div className={`h-5 w-5 ${iconColor}`}>{icon}</div>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-am-surface-500 truncate">{label}</p>
          <p className={`text-xl font-bold tracking-tight ${placeholder ? 'text-am-surface-400' : 'text-am-surface-900'}`}>
            {displayValue}
          </p>
        </div>
        {trend && !placeholder && (
          <div className={`ml-auto flex items-center gap-0.5 text-xs font-semibold ${
            trend.direction === 'up' ? 'text-emerald-600' :
            trend.direction === 'down' ? 'text-red-500' :
            'text-am-surface-400'
          }`}>
            {trend.direction === 'up' && '↑'}
            {trend.direction === 'down' && '↓'}
            {trend.value}%
          </div>
        )}
      </div>
    </div>
  )
}
