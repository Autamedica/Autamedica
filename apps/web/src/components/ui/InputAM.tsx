'use client'
import { forwardRef, useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'

export interface InputAMProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: ReactNode
}

const baseInputStyles =
  'w-full rounded-lg border border-gray-200 bg-white px-3 h-10 text-sm transition-colors focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 outline-none'

const errorInputStyles =
  'w-full rounded-lg border border-red-300 bg-white px-3 h-10 text-sm transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-500/20 outline-none'

export const InputAM = forwardRef<HTMLInputElement, InputAMProps>(function InputAM(
  { label, error, icon, className = '', id: externalId, ...rest },
  ref,
) {
  const autoId = useId()
  const id = externalId ?? autoId

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          className={`${error ? errorInputStyles : baseInputStyles} ${icon ? 'pl-10' : ''} ${className}`}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          {...rest}
        />
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
})
