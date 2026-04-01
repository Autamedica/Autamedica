'use client'
import type { ReactNode } from 'react'

export interface BadgeAMProps {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info'
  size?: 'sm' | 'md'
  dot?: boolean
  children: ReactNode
  className?: string
}

const variantStyles: Record<NonNullable<BadgeAMProps['variant']>, string> = {
  default: 'bg-gray-100 text-gray-700',
  primary: 'bg-sky-50 text-sky-700 border border-sky-200',
  success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border border-amber-200',
  danger: 'bg-red-50 text-red-700 border border-red-200',
  info: 'bg-violet-50 text-violet-700 border border-violet-200',
}

const dotColors: Record<NonNullable<BadgeAMProps['variant']>, string> = {
  default: 'bg-gray-500',
  primary: 'bg-sky-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-violet-500',
}

const sizeStyles: Record<NonNullable<BadgeAMProps['size']>, string> = {
  sm: 'text-[10px] px-1.5 py-0.5',
  md: 'text-xs px-2.5 py-1',
}

const baseStyles = 'inline-flex items-center gap-1 rounded-full font-semibold'

export function BadgeAM({ variant = 'default', size = 'md', dot = false, className = '', children }: BadgeAMProps) {
  return (
    <span className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dotColors[variant]}`} aria-hidden="true" />}
      {children}
    </span>
  )
}
