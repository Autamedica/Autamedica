'use client'
import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export interface ButtonAMProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
  fullWidth?: boolean
}

const variantStyles: Record<NonNullable<ButtonAMProps['variant']>, string> = {
  primary: 'bg-sky-500 text-white hover:bg-sky-600 shadow-sm shadow-sky-500/20',
  secondary: 'border border-gray-200 bg-white text-gray-900 hover:bg-gray-50 hover:border-gray-300',
  ghost: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
  danger: 'bg-red-500 text-white hover:bg-red-600',
}

const sizeStyles: Record<NonNullable<ButtonAMProps['size']>, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-lg gap-2',
  lg: 'h-12 px-6 text-base rounded-xl gap-2.5',
}

const baseStyles =
  'inline-flex items-center justify-center font-semibold transition-all duration-200 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed'

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

export const ButtonAM = forwardRef<HTMLButtonElement, ButtonAMProps>(function ButtonAM(
  { variant = 'primary', size = 'md', loading = false, icon, fullWidth = false, className = '', disabled, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <>
          <Spinner />
          <span>Cargando...</span>
        </>
      ) : (
        <>
          {icon && <span className="shrink-0">{icon}</span>}
          {children}
        </>
      )}
    </button>
  )
})
