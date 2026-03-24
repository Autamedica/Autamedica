'use client'

import React from 'react'

export interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'primary' | 'doctor' | 'success' | 'warning' | 'danger'
  size?: 'xs' | 'sm' | 'md'
  dot?: boolean
  pulse?: boolean
  className?: string
}

const variantStyles: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'bg-am-surface-100 text-am-surface-600 ring-am-surface-200',
  primary: 'bg-am-primary-50 text-am-primary-700 ring-am-primary-200',
  doctor:  'bg-am-doctor-50 text-am-doctor-700 ring-am-doctor-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger:  'bg-red-50 text-red-700 ring-red-200',
}

const dotColors: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'bg-am-surface-400',
  primary: 'bg-am-primary-500',
  doctor:  'bg-am-doctor-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger:  'bg-red-500',
}

const sizeStyles: Record<NonNullable<BadgeProps['size']>, string> = {
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'sm',
  dot = false,
  pulse = false,
  className = '',
}) => {
  return (
    <span className={`
      inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset
      ${variantStyles[variant]}
      ${sizeStyles[size]}
      ${className}
    `}>
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {pulse && (
            <span className={`absolute inset-0 rounded-full animate-ping opacity-50 ${dotColors[variant]}`} />
          )}
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dotColors[variant]}`} />
        </span>
      )}
      {children}
    </span>
  )
}
