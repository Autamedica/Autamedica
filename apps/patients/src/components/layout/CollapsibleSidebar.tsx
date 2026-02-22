'use client'

import {
  BarChart3,
  Bot,
  Brain,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Heart,
  HelpCircle,
  Home,
  MessageSquare,
  Settings,
  Shield,
  ShieldCheck,
  User,
  Users,
  Video,
} from 'lucide-react'
import { useState } from 'react'
import type { MouseEvent } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type NavigationItem = {
  icon: typeof Home
  label: string
  href: string
}

type BottomItem = NavigationItem & {
  assistant?: boolean
  openChat?: boolean
}

const navigationItems: NavigationItem[] = [
  { icon: Home, label: 'Inicio', href: '/' },
  { icon: ClipboardList, label: 'Anamnesis', href: '/anamnesis' },
  { icon: FileText, label: 'Historia clínica', href: '/medical-history' },
  { icon: Heart, label: 'Salud Reproductiva', href: '/reproductive-health' },
  { icon: ShieldCheck, label: 'Prevención Embarazo', href: '/pregnancy-prevention' },
  { icon: Shield, label: 'Salud Preventiva', href: '/preventive-health' },
  { icon: Calendar, label: 'Citas', href: '/appointments' },
  { icon: Video, label: 'Videollamada', href: '/appointments' },
  { icon: MessageSquare, label: 'Comunidad', href: '/community' },
  { icon: Brain, label: 'IA Diagnóstico', href: '/demo/symptom-analyzer' },
  { icon: BarChart3, label: 'Indicadores', href: '/indicators' },
  { icon: Users, label: 'Equipo médico', href: '/team' },
]

const bottomItems: BottomItem[] = [
  { icon: Bot, label: 'Asistente Auta', href: '#', assistant: true, openChat: true },
  { icon: Settings, label: 'Configuración', href: '/settings' },
  { icon: HelpCircle, label: 'Ayuda', href: '/help' },
]

export function CollapsibleSidebar() {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const pathname = usePathname()

  const userName = 'Usuario'
  const userInitials = 'U'

  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    const saved = localStorage.getItem('sidebar-collapsed')
    return saved === 'true'
  })

  const toggleSidebar = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    localStorage.setItem('sidebar-collapsed', String(newState))
  }

  const isActive = (href: string): boolean => {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  const handleBottomItemClick = (item: BottomItem, event: MouseEvent<HTMLAnchorElement>) => {
    if (!item.openChat) return
    event.preventDefault()
    window.dispatchEvent(new Event('open-auta-chat'))
  }

  return (
    <aside
      className={`relative flex flex-col border-r border-stone-200 bg-white py-6 shadow-sm transition-all duration-300 ${
        isCollapsed ? 'w-[64px]' : 'w-[240px]'
      }`}
    >
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-stone-200 bg-white shadow-md transition hover:bg-stone-50"
        aria-label={isCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
      >
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4 text-stone-600" />
        ) : (
          <ChevronLeft className="h-4 w-4 text-stone-600" />
        )}
      </button>

      <div className={`mb-8 px-4 ${isCollapsed ? 'px-2' : ''}`}>
        <div
          className={`relative mx-auto cursor-pointer group ${isCollapsed ? 'h-10 w-10' : 'h-12 w-12'}`}
          title={userName || 'Usuario'}
        >
          <div
            className={`flex items-center justify-center rounded-xl bg-stone-700 font-bold text-white shadow-md transition-colors group-hover:bg-stone-800 ${
              isCollapsed ? 'h-10 w-10 text-xs' : 'h-12 w-12 text-sm'
            }`}
          >
            {isCollapsed ? userInitials[0] : userInitials || <User className="h-5 w-5" />}
          </div>
        </div>
        {!isCollapsed && userName && (
          <p className="mt-2 truncate text-center text-xs font-medium leading-tight text-stone-700">
            {userName.split(' ')[0]}
          </p>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-2">
        {navigationItems.map((item) => {
          const Icon = item.icon
          const isHovered = hoveredItem === item.label
          const isCurrent = isActive(item.href)

          return (
            <div key={item.label} className="relative">
              <Link
                href={item.href}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-3 transition-all ${
                  isCurrent
                    ? 'bg-stone-800 text-white shadow-md'
                    : 'text-stone-700 hover:bg-stone-100 hover:text-stone-900'
                } ${isCollapsed ? 'justify-center' : ''}`}
                onMouseEnter={() => setHoveredItem(item.label)}
                onMouseLeave={() => setHoveredItem(null)}
              >
                <Icon className="h-5 w-5 flex-shrink-0" />
                {!isCollapsed && <span className="truncate text-sm font-medium">{item.label}</span>}
              </Link>

              {isCollapsed && isHovered && (
                <div className="absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-stone-800 px-3 py-2 text-xs font-medium text-white shadow-xl">
                  {item.label}
                  <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-stone-800" />
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="mx-4 my-4 border-t border-stone-300" />

      <div className="space-y-1 px-2">
        {bottomItems.map((item) => {
          const Icon = item.icon
          const isHovered = hoveredItem === item.label
          const isAssistant = item.assistant

          return (
            <div key={item.label} className="relative">
              <Link
                href={item.href}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-3 transition-all ${
                  isAssistant
                    ? 'bg-gradient-to-br from-stone-700 to-stone-800 text-white shadow-md'
                    : 'text-stone-700 hover:bg-stone-100 hover:text-stone-900'
                } ${isCollapsed ? 'justify-center' : ''}`}
                onMouseEnter={() => setHoveredItem(item.label)}
                onMouseLeave={() => setHoveredItem(null)}
                onClick={(event) => handleBottomItemClick(item, event)}
              >
                <Icon className={`h-5 w-5 flex-shrink-0 ${isAssistant ? 'animate-pulse' : ''}`} />
                {!isCollapsed && <span className="truncate text-sm font-medium">{item.label}</span>}

                {isAssistant && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-stone-400 opacity-75"></span>
                    <span className="relative inline-flex h-5 w-5 items-center justify-center rounded-full bg-stone-600 text-[8px] font-bold text-white">
                      AI
                    </span>
                  </span>
                )}
              </Link>

              {isCollapsed && isHovered && (
                <div className="absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-stone-800 px-3 py-2 text-xs font-medium text-white shadow-xl">
                  {item.label}
                  <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-stone-800" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
