"use client"

import { getPatientDisplayName } from '@/utils/patientDisplay'
import { AppointmentsPanel } from '@/components/appointments/AppointmentsPanel'
import AvailabilityManager from '@/components/availability/AvailabilityManager'
import { MarketplacePanel } from '@/components/marketplace/MarketplacePanel'
import { AIHistoryTab } from '@/components/medical/AIHistoryTab'
import { MedicalHistoryTab } from '@/components/medical/MedicalHistoryTab'
import { PrescriptionsTab } from '@/components/medical/PrescriptionsTab'
import { VitalSignsTab } from '@/components/medical/VitalSignsTab'
import { PatientInfoTab } from '@/components/patient/PatientInfoTab'
import { PatientsPanel } from '@/components/patients/PatientsPanel'
import { MedicalRankingPanel } from '@/components/ranking/MedicalRankingPanel'
import { RecordsPanel } from '@/components/records/RecordsPanel'
import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { SubscriptionPanel } from '@/components/subscription/SubscriptionPanel'
import { useActiveSession } from '@/hooks'
import { useAuthenticatedUser } from '@/hooks/useAuthenticatedUser'
import { useDoctorStats } from '@/hooks/useDoctorStats'
import { useCurrentDoctor } from '@/hooks/useRealDoctors'
import type { LucideIcon } from 'lucide-react'
import {
    Activity,
    Brain,
    Calendar,
    ChevronLeft,
    Clock,
    ChevronRight,
    CreditCard,
    FileText,
    Home,
    MapPin,
    Menu,
    MessageSquare,
    Pill,
    Settings,
    Star,
    Users,
    Video,
    X,
} from 'lucide-react'
import type { JSX, ReactNode } from 'react'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'

type TabId = 'video-call' | 'patient-info' | 'medical-history' | 'prescriptions' | 'vital-signs' | 'ai-history'

type SidebarItem = {
  id: string
  icon: LucideIcon
  label: string
  count?: number
  badge?: string
}

type TabConfig = {
  id: TabId
  label: string
  icon: LucideIcon
}

type PortalContextValue = {
  activeTab: TabId
  setActiveTab: (_tab: TabId) => void
  userName: string
  isFocusMode: boolean
  setFocusMode: (_focus: boolean) => void
}

const PortalLayoutContext = createContext<PortalContextValue | null>(null)

export function useDoctorsPortal(): PortalContextValue {
  const value = useContext(PortalLayoutContext)
  if (!value) {
    throw new Error('useDoctorsPortal must be used within DoctorsPortalShell')
  }
  return value
}

function getInitials(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'DR'
  )
}

export function DoctorsPortalShell({ children }: { children: ReactNode }): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('video-call')
  const [currentTime, setCurrentTime] = useState<string>('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [isFocusMode, setIsFocusMode] = useState(false)

  const { user } = useAuthenticatedUser()
  const { doctor } = useCurrentDoctor(user?.id)
  const { stats, loading: statsLoading } = useDoctorStats(doctor?.id)

  useEffect(() => {
    const updateClock = () => {
      setCurrentTime(
        new Intl.DateTimeFormat('es-ES', {
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date()),
      )
    }

    updateClock()
    const interval = setInterval(updateClock, 60_000)
    return () => clearInterval(interval)
  }, [])

  const { session } = useActiveSession()

  const userName = doctor?.profile ? getPatientDisplayName(doctor.profile) :
                   user?.profile ? getPatientDisplayName(user.profile) :
                   `Dr. ${user?.email?.split('@')[0] || 'Medico'}`
  const doctorSpecialty = doctor?.specialty ?? null
  const doctorLicense = doctor?.license_number ?? null

  const appointmentsCount = stats?.todayCount || 0

  useEffect(() => {
    if (session?.status === 'en_progreso' && activeTab === 'video-call' && !activeSection) {
      setIsSidebarCollapsed(true)
    }
  }, [session?.status, activeTab, activeSection])

  useEffect(() => {
    if (isFocusMode) {
      setIsSidebarCollapsed(true)
    }
  }, [isFocusMode])

  const validSections = new Set([
    'settings', 'subscription', 'marketplace', 'ranking',
    'patients', 'appointments', 'availability', 'records', 'chat',
  ])

  const handleSidebarItemClick = (itemId: string) => {
    setIsSidebarOpen(false)
    if (isFocusMode) setIsFocusMode(false)
    setActiveSection(validSections.has(itemId) ? itemId : null)
  }

  // Sidebar = gestión y admin (NO herramientas clínicas, esas van en tabs)
  // Removidos: Pacientes (duplica tab), Historiales (duplica tab), Chat (va en bottom nav)
  const sidebarItems = useMemo<SidebarItem[]>(
    () => [
      { id: 'appointments', icon: Calendar, label: 'Citas', count: appointmentsCount },
      { id: 'availability', icon: Clock, label: 'Disponibilidad' },
      { id: 'marketplace', icon: MapPin, label: 'Trabajo Medico' },
      { id: 'ranking', icon: Star, label: 'Ranking' },
      { id: 'subscription', icon: CreditCard, label: 'Suscripcion' },
      { id: 'settings', icon: Settings, label: 'Configuracion' },
    ],
    [appointmentsCount],
  )

  const resumeFocusIfLive = () => {
    if (session?.status === 'en_progreso') {
      setIsFocusMode(true)
    }
  }

  const tabs = useMemo<TabConfig[]>(
    () => [
      { id: 'video-call', label: 'Consulta', icon: Video },
      { id: 'patient-info', label: 'Paciente', icon: Users },
      { id: 'medical-history', label: 'Historial', icon: FileText },
      { id: 'prescriptions', label: 'Recetas', icon: Pill },
      { id: 'vital-signs', label: 'Signos Vitales', icon: Activity },
      { id: 'ai-history', label: 'IA', icon: Brain },
    ],
    [],
  )

  const portalContext: PortalContextValue = {
    activeTab,
    setActiveTab,
    userName,
    isFocusMode,
    setFocusMode: setIsFocusMode,
  }

  const navItems = sidebarItems.map(({ id, icon: Icon, label, count, badge }) => {
    const isActive = activeSection === id
    return (
      <button
        key={id}
        type="button"
        className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition ${
          isActive ? 'bg-violet-50' : 'hover:bg-slate-50'
        }`}
        onClick={() => handleSidebarItemClick(id)}
      >
        <span className="flex items-center gap-3">
          <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${
            isActive ? 'bg-violet-600 shadow-md shadow-violet-200' : 'bg-slate-100'
          }`}>
            <Icon className={`h-4.5 w-4.5 ${isActive ? 'text-white' : 'text-slate-500'}`} />
          </span>
          <span className={`text-base font-medium ${isActive ? 'text-violet-700' : 'text-slate-700'}`}>{label}</span>
        </span>
        <span className="flex items-center gap-2">
          {typeof count === 'number' && count > 0 && (
            <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-violet-600 px-2 text-xs font-bold text-white">{count}</span>
          )}
          {badge && (
            <span className="rounded-lg bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700">{badge}</span>
          )}
        </span>
      </button>
    )
  })

  return (
    <PortalLayoutContext.Provider value={portalContext}>
      <div
        className={`app h-screen ${isFocusMode ? 'app--focus' : ''} bg-slate-50 text-slate-900`}
        suppressHydrationWarning
      >
        {/* Header */}
        <header className="header z-10 flex items-center justify-between gap-3 border-b border-slate-200/80 bg-white px-4 shadow-sm sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className={`inline-flex items-center justify-center rounded-xl bg-slate-100 p-2.5 text-slate-600 transition hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 ${
                isFocusMode ? '' : 'md:hidden'
              }`}
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 shadow-md shadow-violet-200">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-base font-extrabold tracking-tight text-slate-900">AutaMedica</p>
              <p className="text-sm font-medium text-slate-400">{userName}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 sm:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Conectado
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold tabular-nums text-slate-600">{currentTime}</span>
          </div>
        </header>

        {/* Tabs */}
        <div className="tabs border-b border-slate-200/80 bg-white">
          <div className="flex h-full w-full items-center overflow-x-auto px-2 sm:px-4">
            <div className="flex min-w-full snap-x snap-mandatory gap-1 py-1.5 md:min-w-0">
              {tabs.map((tab) => {
                const isActive = tab.id === activeTab
                const TabIcon = tab.icon
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex min-w-[100px] snap-start items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition md:min-w-0 md:px-4 ${
                      isActive
                        ? 'bg-violet-100 text-violet-700 shadow-sm'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                    }`}
                  >
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      isActive ? 'bg-violet-600 shadow-md shadow-violet-200' : 'bg-slate-100'
                    }`}>
                      <TabIcon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                    </span>
                    <span className="whitespace-nowrap">{tab.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Mobile sidebar overlay */}
        {isSidebarOpen && (
          <div
            className={`fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm ${isFocusMode ? '' : 'md:hidden'}`}
            role="dialog"
            aria-modal="true"
          >
            <div className="relative h-full w-72 max-w-[85vw] border-r border-slate-200 bg-white px-5 py-6 shadow-xl">
              <div className="mb-6 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setActiveSection(null)
                    setActiveTab('video-call')
                    setIsSidebarOpen(false)
                    resumeFocusIfLive()
                  }}
                  className="text-sm font-semibold text-slate-900 transition-colors hover:text-violet-600"
                >
                  Portal Medico
                </button>
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(false)}
                  className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
                  aria-label="Cerrar menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="space-y-1 overflow-y-auto pb-16">{navItems}</nav>
              <div className="absolute inset-x-5 bottom-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 text-sm font-semibold text-white">
                    {getInitials(userName)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{userName}</p>
                    <p className="text-xs text-emerald-600">● Disponible</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main layout */}
        <div className="app__layout flex min-h-0 overflow-hidden">
          {/* Desktop sidebar */}
          <aside
            className={`left-rail relative hidden flex-col border-r border-slate-200 bg-white px-2 py-4 transition-all duration-200 md:flex ${
              !isSidebarCollapsed ? 'left-rail--expanded' : ''
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              {!isSidebarCollapsed && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveSection(null)
                    setActiveTab('video-call')
                    resumeFocusIfLive()
                  }}
                  className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 transition-colors hover:text-violet-600"
                >
                  Portal Medico
                </button>
              )}
              {isSidebarCollapsed && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveSection(null)
                    setActiveTab('video-call')
                    resumeFocusIfLive()
                  }}
                  className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-violet-600"
                  title="Portal Medico"
                >
                  <Home className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
                aria-label={isSidebarCollapsed ? 'Expandir sidebar' : 'Contraer sidebar'}
              >
                {isSidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>
            </div>
            <nav className="space-y-1">
              {sidebarItems.map(({ id, icon: Icon, label, count, badge }) => {
                const isActive = activeSection === id
                return (
                  <button
                    key={id}
                    type="button"
                    className={`sidebar-button flex w-full items-center justify-between rounded-xl px-2 py-2 text-left transition ${
                      isActive ? 'bg-violet-50' : 'hover:bg-slate-50'
                    } ${isSidebarCollapsed ? 'flex-col gap-1 text-center' : 'gap-2'}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      handleSidebarItemClick(id)
                    }}
                    title={isSidebarCollapsed ? label : undefined}
                  >
                    <span className={`flex items-center gap-2.5 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                      <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                        isActive ? 'bg-violet-600 shadow-md shadow-violet-200' : 'bg-slate-100'
                      }`}>
                        <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                      </span>
                      {!isSidebarCollapsed && <span className={`text-sm font-medium ${isActive ? 'text-violet-700' : 'text-slate-600'}`}>{label}</span>}
                    </span>
                    {!isSidebarCollapsed && (
                      <span className="flex items-center gap-2">
                        {typeof count === 'number' && count > 0 && (
                          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-violet-600 px-1.5 text-[10px] font-bold text-white">{count}</span>
                        )}
                        {badge && (
                          <span className="rounded-md bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">{badge}</span>
                        )}
                      </span>
                    )}
                  </button>
                )
              })}
            </nav>
            <div className={`mt-auto rounded-2xl border border-slate-200/80 bg-gradient-to-b from-violet-50 to-slate-50 p-3 ${isSidebarCollapsed ? 'px-2' : ''}`}>
              <div className={`flex items-center gap-3 ${isSidebarCollapsed ? 'flex-col text-center' : ''}`}>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-sm font-bold text-white shadow-md shadow-violet-200">
                  {getInitials(userName)}
                </div>
                {!isSidebarCollapsed && (
                  <div>
                    <p className="text-sm font-medium text-slate-900">{userName}</p>
                    <p className="text-xs text-emerald-600">● Disponible</p>
                  </div>
                )}
              </div>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex min-h-0 flex-1 flex-col bg-slate-50">
            <section className="flex min-h-0 flex-1 overflow-hidden p-0">
              <div
                className="flex h-full w-full flex-col overflow-auto p-4 pb-20 md:pb-4"
                role="main"
                aria-label="Panel de contenido medico principal"
              >
                {activeSection === 'settings' && (
                  <SettingsPanel
                    doctorName={userName}
                    specialty={doctorSpecialty ?? undefined}
                    licenseNumber={doctorLicense ? String(doctorLicense) : undefined}
                  />
                )}
                {activeSection === 'subscription' && <SubscriptionPanel />}
                {activeSection === 'marketplace' && <MarketplacePanel />}
                {activeSection === 'patients' && <PatientsPanel />}
                {activeSection === 'appointments' && <AppointmentsPanel />}
                {activeSection === 'availability' && doctor?.id && <AvailabilityManager doctorId={doctor.id} />}
                {activeSection === 'records' && <RecordsPanel />}
                {activeSection === 'chat' && (
                  <div className="flex h-full flex-col items-center justify-center gap-4 rounded-xl border border-slate-200 bg-white p-8 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-100">
                      <MessageSquare className="h-8 w-8 text-violet-600" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-slate-900">Chat Medico</h3>
                      <p className="text-slate-500">Comunicacion segura con pacientes y colegas</p>
                    </div>
                  </div>
                )}
                {activeSection === 'ranking' && <MedicalRankingPanel />}

                {!activeSection && (
                  <div className="flex min-h-0 flex-1 overflow-hidden">
                    {activeTab === 'video-call' ? (
                      <div className="flex min-h-0 w-full flex-1 overflow-hidden rounded-xl bg-slate-100">
                        {children}
                      </div>
                    ) : (
                      <div className="flex min-h-0 w-full flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-6">
                        {activeTab === 'patient-info' && <PatientInfoTab patientId={session?.patientId || null} />}
                        {activeTab === 'medical-history' && <MedicalHistoryTab patientId={session?.patientId || null} />}
                        {activeTab === 'prescriptions' && <PrescriptionsTab patientId={session?.patientId || null} />}
                        {activeTab === 'vital-signs' && <VitalSignsTab patientId={session?.patientId || null} />}
                        {activeTab === 'ai-history' && <AIHistoryTab patientId={session?.patientId || null} />}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Footer - hidden on mobile where bottom nav takes over */}
            <footer className="hidden border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-500 md:flex md:flex-col md:items-center md:gap-2 lg:flex-row lg:justify-between lg:px-6">
              <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                <span className="font-semibold text-slate-900">AutaMedica</span>
                <span className="hidden text-slate-300 sm:inline">|</span>
                <span className="flex items-center gap-1 text-emerald-600">
                  <span>●</span>
                  {statsLoading ? (
                    'Cargando...'
                  ) : stats?.activeCount ? (
                    `Consultas activas: ${stats.activeCount}/${stats.todayCount}`
                  ) : (
                    'Sin consultas activas'
                  )}
                </span>
                {stats?.nextAppointment && (
                  <>
                    <span className="hidden text-slate-300 sm:inline">|</span>
                    <span>
                      Proxima: {stats.nextAppointment.time} - {stats.nextAppointment.patientName}
                    </span>
                  </>
                )}
              </div>
              <span className="text-slate-400">AutaMedica</span>
            </footer>
          </main>
        </div>

        {/* Mobile bottom navigation */}
        <nav className={`fixed bottom-0 inset-x-0 z-40 flex items-center justify-around border-t border-slate-200/80 bg-white/95 px-2 py-2 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] backdrop-blur-lg safe-area-pb ${isFocusMode ? 'hidden' : ''} md:hidden`}>
          <BottomNavButton
            icon={<Video className="h-6 w-6" />}
            label="Consulta"
            active={!activeSection && activeTab === 'video-call'}
            onClick={() => { setActiveSection(null); setActiveTab('video-call') }}
          />
          <BottomNavButton
            icon={<Calendar className="h-6 w-6" />}
            label="Citas"
            active={activeSection === 'appointments'}
            onClick={() => handleSidebarItemClick('appointments')}
          />
          <BottomNavButton
            icon={<MessageSquare className="h-6 w-6" />}
            label="Chat"
            active={activeSection === 'chat'}
            onClick={() => handleSidebarItemClick('chat')}
          />
          <BottomNavButton
            icon={<Menu className="h-6 w-6" />}
            label="Más"
            active={isSidebarOpen}
            onClick={() => setIsSidebarOpen(true)}
          />
        </nav>
      </div>
    </PortalLayoutContext.Provider>
  )
}

function BottomNavButton({ icon, label, active, onClick }: { icon: ReactNode; label: string; active: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-2 text-xs font-semibold transition ${
        active ? 'bg-violet-50 text-violet-600' : 'text-slate-400 active:text-slate-600'
      }`}
    >
      <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${
        active ? 'bg-violet-600 shadow-md shadow-violet-200' : ''
      }`}>
        <span className={active ? '[&>svg]:text-white' : ''}>{icon}</span>
      </span>
      <span>{label}</span>
    </button>
  )
}
