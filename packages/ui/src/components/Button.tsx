'use client'

import React from 'react'

export interface ButtonProps {
  children: React.ReactNode
  className?: string
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'doctor'
  size?: 'sm' | 'md' | 'lg'
  icon?: React.ReactNode
  iconPosition?: 'left' | 'right'
  loading?: boolean
  fullWidth?: boolean
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
}

const variantStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:   'bg-am-primary-600 text-white shadow-am-sm hover:bg-am-primary-700 hover:shadow-am-primary focus-visible:ring-am-primary-400',
  secondary: 'bg-white text-am-surface-700 border border-am-surface-300 shadow-am-xs hover:bg-am-surface-50 hover:border-am-surface-400 focus-visible:ring-am-surface-400',
  ghost:     'text-am-surface-600 hover:bg-am-surface-100 hover:text-am-surface-900 focus-visible:ring-am-surface-400',
  danger:    'bg-am-danger-DEFAULT text-white shadow-am-sm hover:bg-red-600 focus-visible:ring-red-400',
  doctor:    'bg-am-doctor-500 text-white shadow-am-sm hover:bg-am-doctor-600 hover:shadow-am-doctor focus-visible:ring-am-doctor-400',
}

const sizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5 rounded-lg',
  md: 'px-4 py-2 text-sm gap-2 rounded-xl',
  lg: 'px-5 py-2.5 text-sm gap-2 rounded-xl',
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  fullWidth = false,
  onClick,
  type = 'button',
  disabled = false,
}) => {
  const isDisabled = disabled || loading

  return (
    <button
      type={type}
      className={`
        inline-flex items-center justify-center font-medium
        transition-all duration-am-fast ease-am-ease
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
        active:scale-[0.97]
        disabled:opacity-50 disabled:pointer-events-none
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      onClick={onClick}
      disabled={isDisabled}
      aria-busy={loading || undefined}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {!loading && icon && iconPosition === 'left' && icon}
      {children}
      {!loading && icon && iconPosition === 'right' && icon}
    </button>
  )
}
