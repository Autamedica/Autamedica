'use client'

import React from 'react'

export interface CardProps {
  children: React.ReactNode
  className?: string
  variant?: 'elevated' | 'outlined' | 'filled' | 'glass'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  hover?: 'lift' | 'glow' | 'none'
  as?: 'div' | 'article' | 'section'
  onClick?: () => void
}

const variantStyles: Record<NonNullable<CardProps['variant']>, string> = {
  elevated: 'bg-white border border-am-surface-200 shadow-am-sm',
  outlined: 'bg-white border border-am-surface-200',
  filled:   'bg-am-surface-50 border border-am-surface-100',
  glass:    'bg-white/80 backdrop-blur-sm border border-am-surface-200/50',
}

const paddingStyles: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm:   'p-4',
  md:   'p-6',
  lg:   'p-8',
}

const hoverStyles: Record<NonNullable<CardProps['hover']>, string> = {
  lift: 'transition-all duration-am-base ease-am-ease hover:-translate-y-0.5 hover:shadow-am-card-hover',
  glow: 'transition-all duration-am-base ease-am-ease hover:shadow-am-doctor hover:border-am-doctor-200',
  none: '',
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  variant = 'elevated',
  padding = 'md',
  hover = 'none',
  as: Component = 'div',
  onClick,
}) => {
  return (
    <Component
      className={`rounded-2xl ${variantStyles[variant]} ${paddingStyles[padding]} ${hoverStyles[hover]} ${onClick ? 'cursor-pointer active:scale-[0.98]' : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
    >
      {children}
    </Component>
  )
}
