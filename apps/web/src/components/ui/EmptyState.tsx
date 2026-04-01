import type { JSX, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: { label: string; href: string }
  children?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, action, children }: EmptyStateProps): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 py-16 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm border border-gray-100">
        <Icon className="h-6 w-6 text-gray-400" />
      </div>
      <div>
        <p className="font-semibold text-gray-900">{title}</p>
        {description && <p className="mt-1 max-w-xs text-sm text-gray-400">{description}</p>}
      </div>
      {action && (
        <a
          href={action.href}
          className="rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-sky-500/20 transition-all hover:bg-sky-600 hover:shadow-md active:scale-[0.97]"
        >
          {action.label}
        </a>
      )}
      {children}
    </div>
  )
}
