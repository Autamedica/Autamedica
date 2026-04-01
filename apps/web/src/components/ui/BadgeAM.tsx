'use client'
import type { HTMLAttributes, ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-full font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-gray-100 text-gray-700',
        primary: 'bg-sky-50 text-sky-700 border border-sky-200',
        success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
        warning: 'bg-amber-50 text-amber-700 border border-amber-200',
        danger: 'bg-red-50 text-red-700 border border-red-200',
        info: 'bg-violet-50 text-violet-700 border border-violet-200',
      },
      size: {
        sm: 'text-[10px] px-1.5 py-0.5 gap-1',
        md: 'text-xs px-2.5 py-1 gap-1.5',
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

export interface BadgeAMProps 
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean
  children: ReactNode
}

const dotColors: Record<NonNullable<VariantProps<typeof badgeVariants>['variant']>, string> = {
  default: 'bg-gray-500',
  primary: 'bg-sky-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-violet-500',
}

export function BadgeAM({ variant, size, dot = false, className, children, ...props }: BadgeAMProps) {
  return (
    <span className={cn(badgeVariants({ variant, size, className }))} {...props}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dotColors[variant ?? 'default'])} aria-hidden="true" />}
      {children}
    </span>
  )
}
