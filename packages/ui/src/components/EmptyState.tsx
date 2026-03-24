'use client'

import React from 'react'

export interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
    icon?: React.ReactNode
  }
  className?: string
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center py-16 px-6 text-center animate-fadeIn ${className}`}>
      {icon && (
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-am-surface-100 text-am-surface-400">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-am-surface-900 tracking-tight mb-2">
        {title}
      </h3>
      <p className="text-sm text-am-surface-500 max-w-sm leading-relaxed">
        {description}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-am-primary-600 px-4 py-2 text-sm font-medium text-white shadow-am-sm transition-all duration-am-fast hover:bg-am-primary-700 hover:shadow-am-primary active:scale-[0.97]"
        >
          {action.icon}
          {action.label}
        </button>
      )}
    </div>
  )
}
