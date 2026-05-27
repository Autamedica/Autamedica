'use client'

import { Calendar, Home, MessageCircle, Pill, Video } from 'lucide-react'

export type PatientTab = 'inicio' | 'agenda' | 'consultar' | 'historial' | 'comunidad'

interface BottomNavProps {
  activeTab?: PatientTab
}

const TABS: Array<{ key: PatientTab; label: string; href: string; icon: typeof Home; center?: boolean }> = [
  { key: 'inicio', label: 'Inicio', href: '/?portal=patient', icon: Home },
  { key: 'agenda', label: 'Mi agenda', href: '/patients/appointments', icon: Calendar },
  { key: 'consultar', label: 'Médico online', href: '/patients/appointments?type=telemedicine', icon: Video, center: true },
  { key: 'historial', label: 'Mis medicamentos', href: '/patients/medical-history', icon: Pill },
  { key: 'comunidad', label: 'Foro de pacientes', href: '/patients/community', icon: MessageCircle },
]

export default function BottomNav({ activeTab = 'inicio' }: BottomNavProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-100 bg-white/90 backdrop-blur-xl md:hidden">
      <div className="mx-auto flex max-w-lg items-end justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ key, label, href, icon: Icon, center }) => {
          const isActive = activeTab === key

          if (center) {
            return (
              <a
                key={key}
                href={href}
                className="group -mt-5 flex flex-col items-center gap-0.5 pb-2"
              >
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-900 shadow-lg transition-transform active:scale-95"
                  style={{
                    boxShadow: isActive
                      ? '0 0 20px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.2)'
                      : '0 4px 12px rgba(0,0,0,0.15)',
                  }}
                >
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <span className={`text-[10px] font-medium ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                  {label}
                </span>
              </a>
            )
          }

          return (
            <a
              key={key}
              href={href}
              className="flex flex-col items-center gap-0.5 px-3 py-2"
            >
              <Icon className={`h-5 w-5 transition-colors ${isActive ? 'text-gray-900' : 'text-gray-400'}`} />
              <span className={`text-[10px] font-medium transition-colors ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                {label}
              </span>
            </a>
          )
        })}
      </div>
    </nav>
  )
}
