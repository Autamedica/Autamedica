import type { JSX } from 'react'
import type { LucideIcon } from 'lucide-react'

type SidebarItem = {
  id: string
  icon: LucideIcon
  label: string
  count?: number
  badge?: string
}

interface SidebarNavigationProps {
  items: SidebarItem[]
  activeSection: string | null
  isSidebarCollapsed: boolean
  clinicalEnd: number
  toolsEnd: number
  onItemClick: (id: string) => void
}

export function SidebarNavigation({
  items,
  activeSection,
  isSidebarCollapsed,
  clinicalEnd,
  toolsEnd,
  onItemClick,
}: SidebarNavigationProps): JSX.Element {
  return (
    <nav className="space-y-0.5 overflow-y-auto flex-1">
      {items.map(({ id, icon: Icon, label, count, badge }, index) => {
        const isActive = activeSection === id
        const groupLabel = !isSidebarCollapsed && (index === 0 ? 'Clínica' : index === clinicalEnd + 1 ? 'Herramientas' : index === toolsEnd + 1 ? 'Plataforma' : null)
        return (
          <div key={id}>
            {groupLabel && (
              <p className={`px-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-am-surface-500 ${index > 0 ? 'mt-4 mb-1.5' : 'mb-1.5'}`}>
                {groupLabel}
              </p>
            )}
            {!isSidebarCollapsed && index > 0 && (index === clinicalEnd + 1 || index === toolsEnd + 1) && (
              <div className="mx-2.5 mb-2 h-px bg-am-surface-200" />
            )}
            <button
              type="button"
              className={`sidebar-button relative flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-all duration-am-fast ease-am-ease ${
                isActive
                  ? 'bg-am-doctor-50 text-am-doctor-600 ring-1 ring-am-doctor-200'
                  : 'text-am-surface-700 hover:bg-am-surface-100 hover:text-am-surface-900'
              } ${isSidebarCollapsed ? 'flex-col gap-1 text-center' : 'gap-2'}`}
              onClick={(event) => {
                event.stopPropagation()
                onItemClick(id)
              }}
              title={isSidebarCollapsed ? label : undefined}
            >
              {isActive && !isSidebarCollapsed && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-am-doctor-500" />
              )}
              <span className={`flex items-center gap-2.5 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                <Icon className={`h-4 w-4 transition-colors ${isActive ? 'text-am-doctor-600' : 'text-am-surface-500'}`} />
                {!isSidebarCollapsed && <span className="font-medium">{label}</span>}
              </span>
              {!isSidebarCollapsed && (
                <span className="flex items-center gap-2">
                  {typeof count === 'number' && count > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-am-doctor-100 px-1.5 text-[10px] font-semibold text-am-doctor-600">{count}</span>
                  )}
                  {badge && (
                    <span className="rounded-full bg-am-doctor-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{badge}</span>
                  )}
                </span>
              )}
            </button>
          </div>
        )
      })}
    </nav>
  )
}
