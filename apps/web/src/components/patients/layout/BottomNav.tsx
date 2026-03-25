'use client'

import { Calendar, Home, MessageCircle, FileText, Video } from 'lucide-react'

export type PatientTab = 'inicio' | 'agenda' | 'consultar' | 'historial' | 'comunidad'

interface BottomNavProps {
  activeTab?: PatientTab
}

const TABS: Array<{ key: PatientTab; label: string; href: string; icon: typeof Home; center?: boolean }> = [
  { key: 'inicio', label: 'Inicio', href: '/?portal=patient', icon: Home },
  { key: 'agenda', label: 'Agenda', href: '/patients/appointments', icon: Calendar },
  { key: 'consultar', label: 'Consultar', href: '/patients/appointments?type=telemedicine', icon: Video, center: true },
  { key: 'historial', label: 'Historial', href: '/patients/medical-history', icon: FileText },
  { key: 'comunidad', label: 'Comunidad', href: '/patients/community', icon: MessageCircle },
]

export default function BottomNav({ activeTab = 'inicio' }: BottomNavProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t sm:hidden"
      style={{
        background: 'var(--au-surface)',
        borderColor: 'var(--au-border)',
      }}
    >
      <div className="mx-auto flex max-w-lg items-end justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ key, label, href, icon: Icon, center }) => {
          const isActive = activeTab === key

          if (center) {
            return (
              <a
                key={key}
                href={href}
                className="group -mt-5 flex flex-col items-center gap-0.5"
              >
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95"
                  style={{
                    background: 'var(--au-accent)',
                    boxShadow: isActive
                      ? '0 0 20px var(--au-accent-glow), 0 4px 12px rgba(0,0,0,0.3)'
                      : '0 4px 12px rgba(0,0,0,0.3)',
                  }}
                >
                  <Icon className="h-6 w-6" style={{ color: 'var(--au-bg)' }} />
                </div>
                <span
                  className="text-[10px] font-medium"
                  style={{ color: isActive ? 'var(--au-accent)' : 'var(--au-text-tertiary)' }}
                >
                  {label}
                </span>
              </a>
            )
          }

          return (
            <a
              key={key}
              href={href}
              className="flex flex-col items-center gap-0.5 py-2 px-3"
            >
              <Icon
                className="h-5 w-5 transition-colors"
                style={{ color: isActive ? 'var(--au-accent)' : 'var(--au-text-tertiary)' }}
              />
              <span
                className="text-[10px] font-medium transition-colors"
                style={{ color: isActive ? 'var(--au-accent)' : 'var(--au-text-tertiary)' }}
              >
                {label}
              </span>
            </a>
          )
        })}
      </div>
    </nav>
  )
}
