'use client'
import { forwardRef } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'

export interface CardAMProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'outlined' | 'ghost'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  interactive?: boolean
  children: ReactNode
}

const variantStyles: Record<NonNullable<CardAMProps['variant']>, string> = {
  default: 'bg-white border border-gray-100 rounded-xl',
  elevated: 'bg-white rounded-xl shadow-md',
  outlined: 'bg-transparent border border-gray-200 rounded-xl',
  ghost: 'bg-gray-50/50 rounded-xl',
}

const paddingStyles: Record<NonNullable<CardAMProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-8',
}

const interactiveStyles = 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 active:scale-[0.98]'

export const CardAM = forwardRef<HTMLDivElement, CardAMProps>(function CardAM(
  { variant = 'default', padding = 'md', interactive = false, className = '', children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={`${variantStyles[variant]} ${paddingStyles[padding]} ${interactive ? interactiveStyles : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
})
