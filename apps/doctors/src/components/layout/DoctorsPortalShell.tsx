"use client"

import { getPatientDisplayName } from '@/utils/patientDisplay'
import { AppointmentsPanel } from '@/components/appointments/AppointmentsPanel'
import { DiagnosisPanel } from '@/components/diagnosis/DiagnosisPanel'
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
import { VitalSignsPanel } from '@/components/vitals/VitalSignsPanel'
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
    ChevronRight,
    CreditCard,
    FileText,
    History,
    Home,
    MapPin,
    Menu,
    MessageSquare,
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
  icon: string
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
  const doctorSpecialty = doctor?.specialty || 'Medicina General'
  const doctorLicense = doctor?.license_number || 'No registrado'

  const patientsCount = 0
  const appointmentsCount = stats?.todayCount || 0
  const historyCount = 0

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

  const handleSidebarItemClick = (itemId: string) => {
    setIsSidebarOpen(false)

    if (isFocusMode) {
      setIsFocusMode(false)
    }

    switch (itemId) {
      case 'settings':
        setActiveSection('settings')
        break
      case 'subscription':
        setActiveSection('subscription')
        break
      case 'marketplace':
        setActiveSection('marketplace')
        break
      case 'ranking':
        setActiveSection('ranking')
        break
      case 'patients':
        setActiveSection('patients')
        break
      case 'appointments':
        setActiveSection('appointments')
        break
      case 'records':
        setActiveSection('records')
        break
      case 'vitals':
        setActiveSection('vitals')
        break
      case 'chat':
        setActiveSection('chat')
        break
      case 'diagnosis':
        setActiveSection('diagnosis')
        break
      case 'history':
        setActiveSection('history')
        break
      default:
        setActiveSection(null)
    }
  }

  const sidebarItems = useMemo<SidebarItem[]>(
    () => [
      { id: 'patients', icon: Users, label: 'Pacientes', count: patientsCount },
      { id: 'appointments', icon: Calendar, label: 'Citas', count: appointmentsCount },
      { id: 'records', icon: FileText, label: 'Historiales', count: historyCount },
      { id: 'vitals', icon: Activity, label: 'Signos Vitales' },
      { id: 'chat', icon: MessageSquare, label: 'Chat', count: 0 },
      { id: 'diagnosis', icon: Brain, label: 'Asistente Clinico' },
      { id: 'history', icon: History, label: 'Historial IA', count: 0 },
      { id: 'ranking', icon: Star, label: 'Ranking', badge: 'GOLD' },
      { id: 'subscription', icon: CreditCard, label: 'Suscripcion', badge: 'PRO' },
      { id: 'marketplace', icon: MapPin, label: 'Trabajo Medico' },
      { id: 'settings', icon: Settings, label: 'Configuracion' },
    ],
    [patientsCount, appointmentsCount, historyCount],
  )

  const resumeFocusIfLive = () => {
    if (session?.status === 'en_progreso') {
      setIsFocusMode(true)
    }
  }

  const tabs = useMemo<TabConfig[]>(
    () => [
      { id: 'video-call', label: 'Consulta', icon: '🎥' },
      { id: 'patient-info', label: 'Paciente', icon: '👤' },
      { id: 'medical-history', label: 'Historial', icon: '📋' },
      { id: 'prescriptions', label: 'Recetas', icon: '💊' },
      { id: 'vital-signs', label: 'Signos Vitales', icon: '📊' },
      { id: 'ai-history', label: 'IA', icon: '🧠' },
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

  const navItems = sidebarItems.map(({ id, icon: Icon, label, count, badge }) => (
    <button
      key={id}
      type="button"
      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 ${
        activeSection === id ? 'bg-violet-50 text-violet-700' : 'text-slate-600'
      }`}
      onClick={() => handleSidebarItemClick(id)}
    >
      <span className="flex items-center gap-3">
        <Icon className={`h-4 w-4 ${activeSection === id ? 'text-violet-600' : 'text-slate-400'}`} />
        <span>{label}</span>
      </span>
      <span className="flex items-center gap-2">
        {typeof count === 'number' && count > 0 && (
          <span className="rounded-full bg-violet-600 px-2 py-0.5 text-xs font-semibold text-white">{count}</span>
        )}
        {badge && (
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">{badge}</span>
        )}
      </span>
    </button>
  ))

  return (
    <PortalLayoutContext.Provider value={portalContext}>
      <div
        className={`app h-screen ${isFocusMode ? 'app--focus' : ''} bg-slate-50 text-slate-900`}
        suppressHydrationWarning
      >
        {/* Header */}
        <header className="header z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className={`inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 ${
                isFocusMode ? '' : 'md:hidden'
              }`}
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
              <Activity className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">AutaMedica</p>
              <p className="text-xs text-slate-500">{userName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="hidden items-center gap-1 text-emerald-600 sm:flex">
              <span>●</span>
              Conectado
            </span>
            <span className="hidden text-slate-300 sm:inline">|</span>
            <span>{currentTime}</span>
          </div>
        </header>

        {/* Tabs */}
        <div className="tabs border-b border-slate-200 bg-white">
          <div className="flex h-full w-full items-center overflow-x-auto px-2 sm:px-6">
            <div className="flex min-w-full snap-x snap-mandatory gap-1 md:min-w-0 md:gap-0">
              {tabs.map((tab) => {
                const isActive = tab.id === activeTab
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex min-w-[120px] snap-start items-center gap-2 border-b-2 px-4 py-2 text-sm transition md:min-w-0 md:px-5 md:py-2.5 ${
                      isActive
                        ? 'border-violet-600 font-medium text-violet-700'
                        : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                    }`}
                  >
                    <span>{tab.icon}</span>
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
              {sidebarItems.map(({ id, icon: Icon, label, count, badge }) => (
                <button
                  key={id}
                  type="button"
                  className={`sidebar-button flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 ${
                    activeSection === id ? 'bg-violet-50 text-violet-700' : 'text-slate-600'
                  } ${isSidebarCollapsed ? 'flex-col gap-1 text-center' : 'gap-2'}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleSidebarItemClick(id)
                  }}
                  title={isSidebarCollapsed ? label : undefined}
                >
                  <span className={`flex items-center gap-2 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                    <Icon className={`h-4 w-4 ${activeSection === id ? 'text-violet-600' : 'text-slate-400'}`} />
                    {!isSidebarCollapsed && <span>{label}</span>}
                  </span>
                  {!isSidebarCollapsed && (
                    <span className="flex items-center gap-2">
                      {typeof count === 'number' && count > 0 && (
                        <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold text-white">{count}</span>
                      )}
                      {badge && (
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">{badge}</span>
                      )}
                    </span>
                  )}
                </button>
              ))}
            </nav>
            <div className={`mt-auto rounded-xl border border-slate-200 bg-slate-50 p-3 ${isSidebarCollapsed ? 'px-2' : ''}`}>
              <div className={`flex items-center gap-3 ${isSidebarCollapsed ? 'flex-col text-center' : ''}`}>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-600 text-sm font-semibold text-white">
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
                    specialty={doctorSpecialty}
                    licenseNumber={String(doctorLicense)}
                  />
                )}
                {activeSection === 'subscription' && <SubscriptionPanel />}
                {activeSection === 'marketplace' && <MarketplacePanel />}
                {activeSection === 'patients' && <PatientsPanel />}
                {activeSection === 'appointments' && <AppointmentsPanel />}
                {activeSection === 'records' && <RecordsPanel />}
                {activeSection === 'vitals' && <VitalSignsPanel />}
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
                {activeSection === 'diagnosis' && <DiagnosisPanel />}
                {activeSection === 'history' && (
                  <div className="flex h-full flex-col items-center justify-center gap-4 rounded-xl border border-slate-200 bg-white p-8 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-100">
                      <Brain className="h-8 w-8 text-violet-600" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-slate-900">Historial IA</h3>
                      <p className="text-slate-500">Historial de analisis y recomendaciones de IA</p>
                    </div>
                  </div>
                )}
                {activeSection === 'ranking' && <MedicalRankingPanel />}

                {!activeSection && (
                  <div className="flex min-h-0 flex-1 overflow-hidden">
                    {activeTab === 'video-call' ? (
                      <div className="flex min-h-0 w-full flex-1 overflow-hidden rounded-xl bg-slate-900">
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
              <div className="flex items-center gap-3">
                <span>AutaMedica Clinica</span>
                <span className="hidden text-slate-300 sm:inline">|</span>
                <span className="flex items-center gap-1 text-emerald-600">
                  <span>●</span>
                  Sincronizacion segura
                </span>
              </div>
            </footer>
          </main>
        </div>

        {/* Mobile bottom navigation */}
        <nav className={`fixed bottom-0 inset-x-0 z-40 flex items-center justify-around border-t border-slate-200 bg-white px-2 py-1.5 safe-area-pb ${isFocusMode ? 'hidden' : ''} md:hidden`}>
          <BottomNavButton
            icon={<Video className="h-5 w-5" />}
            label="Consulta"
            active={!activeSection && activeTab === 'video-call'}
            onClick={() => { setActiveSection(null); setActiveTab('video-call') }}
          />
          <BottomNavButton
            icon={<Users className="h-5 w-5" />}
            label="Pacientes"
            active={activeSection === 'patients'}
            onClick={() => handleSidebarItemClick('patients')}
          />
          <BottomNavButton
            icon={<Calendar className="h-5 w-5" />}
            label="Citas"
            active={activeSection === 'appointments'}
            onClick={() => handleSidebarItemClick('appointments')}
          />
          <BottomNavButton
            icon={<MessageSquare className="h-5 w-5" />}
            label="Chat"
            active={activeSection === 'chat'}
            onClick={() => handleSidebarItemClick('chat')}
          />
          <BottomNavButton
            icon={<Settings className="h-5 w-5" />}
            label="Perfil"
            active={activeSection === 'settings'}
            onClick={() => handleSidebarItemClick('settings')}
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
      className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition ${
        active ? 'text-violet-600' : 'text-slate-400 active:text-slate-600'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
