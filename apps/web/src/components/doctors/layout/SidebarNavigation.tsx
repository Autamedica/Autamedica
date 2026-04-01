import type { JSX } from 'react'
import type { LucideIcon } from 'lucide-react'

type SidebarItem = {
  id: string
  icon: LucideIcon
  label: string
  count?: number
  badge?: string
  nextAppointmentTime?: string | null
}

interface SidebarNavigationProps {
  items: SidebarItem[]
  activeSection: string | null
  isSidebarCollapsed: boolean
  clinicalEnd: number
  toolsEnd: number
  onItemClick: (id: string) => void
}

function getIconGroupStyles(index: number, clinicalEnd: number, toolsEnd: number, isActive: boolean): string {
  if (!isActive) return ''
  if (index <= clinicalEnd) return 'bg-sky-50 text-sky-600'
  if (index <= toolsEnd) return 'bg-violet-50 text-violet-600'
  return 'bg-gray-100 text-gray-600'
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
      {items.map(({ id, icon: Icon, label, count, badge, nextAppointmentTime }, index) => {
        const isActive = activeSection === id
        const groupLabel = !isSidebarCollapsed && (index === 0 ? 'Clínica' : index === clinicalEnd + 1 ? 'Herramientas' : index === toolsEnd + 1 ? 'Plataforma' : null)
        const iconGroupStyle = getIconGroupStyles(index, clinicalEnd, toolsEnd, isActive)
        return (
          <div key={id}>
            {groupLabel && (
              <p className={`px-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-am-surface-400 ${index > 0 ? 'mt-5 mb-2' : 'mb-2'}`}>
                {groupLabel}
              </p>
            )}
            {!isSidebarCollapsed && index > 0 && (index === clinicalEnd + 1 || index === toolsEnd + 1) && (
              <div className="mx-2.5 mb-2.5 h-px bg-am-surface-200" />
            )}
            <button
              type="button"
              className={`au-interactive au-focus-ring sidebar-button relative flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-all duration-am-fast ease-am-ease ${
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
                <span className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${iconGroupStyle}`}>
                  <Icon className={`h-4 w-4 transition-colors ${isActive ? '' : 'text-am-surface-500'}`} />
                </span>
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
            {id === 'appointments' && nextAppointmentTime && !isSidebarCollapsed && (
              <p className="ml-10 mt-0.5 text-[10px] font-medium text-am-surface-400">
                Proxima: {nextAppointmentTime}
              </p>
            )}
          </div>
        )
      })}
    </nav>
  )
}
