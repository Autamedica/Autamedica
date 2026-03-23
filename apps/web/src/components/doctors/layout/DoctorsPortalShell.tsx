"use client"

import { AppointmentsPanel } from '@/components/doctors/appointments/AppointmentsPanel'
import { DiagnosisPanel } from '@/components/doctors/diagnosis/DiagnosisPanel'
import { AIHistoryTab } from '@/components/doctors/medical/AIHistoryTab'
import { MedicalHistoryTab } from '@/components/doctors/medical/MedicalHistoryTab'
import { PrescriptionsTab } from '@/components/doctors/medical/PrescriptionsTab'
import { VitalSignsTab } from '@/components/doctors/medical/VitalSignsTab'
import { PatientInfoTab } from '@/components/doctors/patient/PatientInfoTab'
import { PatientsPanel } from '@/components/doctors/patients/PatientsPanel'
import { MedicalRankingPanel } from '@/components/doctors/ranking/MedicalRankingPanel'
import { RecordsPanel } from '@/components/doctors/records/RecordsPanel'
import { SettingsPanel } from '@/components/doctors/settings/SettingsPanel'
import { SubscriptionPanel } from '@/components/doctors/subscription/SubscriptionPanel'
import { VitalSignsPanel } from '@/components/doctors/vitals/VitalSignsPanel'
import { useActiveSession } from '@/hooks/doctors/useActiveSession'
import { useAuthenticatedUser } from '@/hooks/doctors/useAuthenticatedUser'
import { useDoctorStats } from '@/hooks/doctors/useDoctorStats'
import { useCurrentDoctor } from '@/hooks/doctors/useRealDoctors'
import type { LucideIcon } from 'lucide-react'
import {
    Activity,
    BarChart3,
    Brain,
    Calendar,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    CreditCard,
    FileText,
    History,
    Home,
    MapPin,
    Menu,
    MessageSquare,
    Pill,
    Settings,
    Star,
    User,
    Users,
    Video,
    X,
} from 'lucide-react'
import type { JSX, ReactNode } from 'react'
import { Suspense, createContext, lazy, useContext, useEffect, useMemo, useState } from 'react'

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
  setActiveTab: (tab: TabId) => void
  userName: string
  isFocusMode: boolean
  setFocusMode: (focus: boolean) => void
}

const PortalLayoutContext = createContext<PortalContextValue | null>(null)

const MarketplacePanel = lazy(async () => {
  const module = await import('@/components/doctors/marketplace/MarketplacePanel')
  return { default: module.MarketplacePanel }
})

type NameCandidate = {
  full_name?: string | null
  first_name?: string | null
  last_name?: string | null
  firstName?: string | null
  lastName?: string | null
}

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

function resolveDoctorDisplayName(...candidates: Array<NameCandidate | null | undefined>): string {
  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }

    const fullName = candidate.full_name?.trim()
      || [candidate.first_name, candidate.last_name].filter(Boolean).join(' ').trim()
      || [candidate.firstName, candidate.lastName].filter(Boolean).join(' ').trim()

    if (fullName) {
      return fullName
    }
  }

  return 'Cuenta médica'
}

export function DoctorsPortalShell({ children }: { children: ReactNode }): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabId>('video-call')
  const [currentTime, setCurrentTime] = useState<string>('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [isFocusMode, setIsFocusMode] = useState(false)

  // Production-ready hooks for real data
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

  // Hook para obtener la sesión activa con el paciente
  const { session } = useActiveSession()

  // Real userName from authenticated user or doctor profile
  const userName = resolveDoctorDisplayName(doctor?.profile, user?.profile)
  const doctorSpecialty = doctor?.specialty || 'Especialidad pendiente'
  const doctorLicense = doctor?.license_number || 'Registro pendiente'

  // No inventar métricas cuando el backend todavía no expone esos agregados.
  const patientsCount = undefined
  const appointmentsCount = stats?.todayCount || 0
  const historyCount = undefined

  // Efecto para plegar el sidebar automáticamente cuando inicia una videollamada
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
      { id: 'diagnosis', icon: Brain, label: 'Asistente Clínico' },
      { id: 'history', icon: History, label: 'Historial IA', count: 0 },
      { id: 'ranking', icon: Star, label: 'Ranking' },
      { id: 'subscription', icon: CreditCard, label: 'Suscripción' },
      { id: 'marketplace', icon: MapPin, label: 'Trabajo Médico' },
      { id: 'settings', icon: Settings, label: 'Configuración' },
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
      { id: 'video-call', label: 'Videollamada', icon: Video },
      { id: 'patient-info', label: 'Paciente', icon: User },
      { id: 'medical-history', label: 'Historial', icon: ClipboardList },
      { id: 'prescriptions', label: 'Prescripciones', icon: Pill },
      { id: 'vital-signs', label: 'Signos Vitales', icon: BarChart3 },
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
        className={`relative flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-all ${
          isActive
            ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20'
            : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
        }`}
        onClick={() => handleSidebarItemClick(id)}
      >
        {isActive && (
          <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-emerald-400 to-teal-400" />
        )}
        <span className="flex items-center gap-3">
          <Icon className={`h-4 w-4 transition-colors ${isActive ? 'text-emerald-400' : 'text-slate-500'}`} />
          <span className="font-medium">{label}</span>
        </span>
        <span className="flex items-center gap-2">
          {typeof count === 'number' && count > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500/15 px-1.5 text-[10px] font-semibold text-emerald-400">{count}</span>
          )}
          {badge && (
            <span className="rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-900">{badge}</span>
          )}
        </span>
      </button>
    )
  })

  return (
    <PortalLayoutContext.Provider value={portalContext}>
      <div
        className={`app flex flex-col ${isFocusMode ? 'app--focus' : ''} bg-[#080f1e] text-slate-100`}
        suppressHydrationWarning
      >
        <header className="header z-10 flex items-center justify-between gap-3 border-b border-white/[0.06] bg-[#0b1628]/90 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className={`inline-flex items-center justify-center rounded-xl p-2 text-slate-400 transition-all hover:bg-white/[0.06] hover:text-white active:scale-95 ${
                isFocusMode ? '' : 'md:hidden'
              }`}
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-500/25">
              <Activity className="h-4.5 w-4.5 text-white" />
              <div className="absolute -inset-px rounded-xl bg-gradient-to-br from-white/20 to-transparent" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight text-white">AutaMedica</p>
              <p className="text-[11px] font-medium text-slate-500">{userName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="hidden items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium text-emerald-400 ring-1 ring-emerald-500/20 sm:flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              En línea
            </span>
            <span className="rounded-lg bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-slate-500 ring-1 ring-white/[0.06]">{currentTime}</span>
          </div>
        </header>

        <div className="tabs border-b border-white/[0.06] bg-[#0b1628]/60 backdrop-blur-sm">
          <div className="flex h-full w-full items-center overflow-x-auto px-2 sm:px-4">
            <div className="flex min-w-full snap-x snap-mandatory gap-0.5 md:min-w-0">
              {tabs.map((tab) => {
                const isActive = tab.id === activeTab
                const TabIcon = tab.icon
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative flex min-w-[140px] snap-start items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all md:min-w-0 ${
                      isActive
                        ? 'text-emerald-400'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <TabIcon className={`h-3.5 w-3.5 ${isActive ? 'text-emerald-400' : ''}`} />
                    <span className="whitespace-nowrap">{tab.label}</span>
                    {isActive && (
                      <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-gradient-to-r from-emerald-400 to-teal-400" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {isSidebarOpen && (
          <div
            className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-sm ${isFocusMode ? '' : 'md:hidden'}`}
            role="dialog"
            aria-modal="true"
            onClick={() => setIsSidebarOpen(false)}
          >
            <div
              className="relative h-full w-72 max-w-[85vw] border-r border-white/[0.06] bg-gradient-to-b from-[#0b1628] to-[#080f1e] px-5 py-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-6 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setActiveSection(null)
                    setActiveTab('video-call')
                    setIsSidebarOpen(false)
                    resumeFocusIfLive()
                  }}
                  className="text-sm font-bold text-white transition-colors hover:text-emerald-400"
                >
                  Portal Médico
                </button>
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(false)}
                  className="rounded-xl p-2 text-slate-500 transition-all hover:bg-white/[0.06] hover:text-white active:scale-95"
                  aria-label="Cerrar menú"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="space-y-1 overflow-y-auto pb-16">{navItems}</nav>
              <div className="absolute inset-x-5 bottom-6 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
                <div className="flex items-center gap-3">
                  <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-xs font-bold text-white shadow-lg shadow-emerald-500/25">
                    {getInitials(userName)}
                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0b1628] bg-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{userName}</p>
                    <p className="text-[10px] font-medium text-emerald-500/70">Disponible</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="app__layout flex min-h-0 flex-1 overflow-hidden">
          <aside
            className={`left-rail relative hidden flex-col border-r border-white/[0.06] bg-gradient-to-b from-[#0b1628] to-[#080f1e] px-2 py-4 transition-all duration-300 md:flex ${
              !isSidebarCollapsed ? 'left-rail--expanded w-[220px]' : 'w-12'
            }`}
          >
            <div className="mb-5 flex items-center justify-between px-1">
              {!isSidebarCollapsed && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveSection(null)
                    setActiveTab('video-call')
                    resumeFocusIfLive()
                  }}
                  className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600 transition-colors hover:text-emerald-400"
                >
                  Menú
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
                  className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-white/[0.04] hover:text-emerald-400"
                  title="Portal Médico"
                >
                  <Home className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
                aria-label={isSidebarCollapsed ? 'Expandir sidebar' : 'Contraer sidebar'}
              >
                {isSidebarCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
              </button>
            </div>
            <nav className="space-y-0.5">
              {sidebarItems.map(({ id, icon: Icon, label, count, badge }) => {
                const isActive = activeSection === id
                return (
                  <button
                    key={id}
                    type="button"
                    className={`sidebar-button relative flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-all ${
                      isActive
                        ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20'
                        : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                    } ${isSidebarCollapsed ? 'flex-col gap-1 text-center' : 'gap-2'}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      handleSidebarItemClick(id)
                    }}
                    title={isSidebarCollapsed ? label : undefined}
                  >
                    {isActive && !isSidebarCollapsed && (
                      <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-emerald-400 to-teal-400" />
                    )}
                    <span className={`flex items-center gap-2.5 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                      <Icon className={`h-4 w-4 transition-colors ${isActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                      {!isSidebarCollapsed && <span className="font-medium">{label}</span>}
                    </span>
                    {!isSidebarCollapsed && (
                      <span className="flex items-center gap-2">
                        {typeof count === 'number' && count > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500/15 px-1.5 text-[10px] font-semibold text-emerald-400">{count}</span>
                        )}
                        {badge && (
                          <span className="rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-900">{badge}</span>
                        )}
                      </span>
                    )}
                  </button>
                )
              })}
            </nav>
            <div className={`mt-auto rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 ${isSidebarCollapsed ? 'px-2' : ''}`}>
              <div className={`flex items-center gap-3 ${isSidebarCollapsed ? 'flex-col text-center' : ''}`}>
                <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-xs font-bold text-white shadow-lg shadow-emerald-500/25">
                  {getInitials(userName)}
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0b1628] bg-emerald-400" />
                </div>
                {!isSidebarCollapsed && (
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-200">{userName}</p>
                    <p className="text-[10px] font-medium text-emerald-500/70">Disponible</p>
                  </div>
                )}
              </div>
            </div>
          </aside>

          <main className="flex min-h-0 flex-1 flex-col bg-[#080f1e]">
            <section
              className={`flex min-h-0 flex-1 overflow-hidden p-0`}
            >
              <div
                className="flex h-full w-full flex-col overflow-auto p-4 md:p-6"
                role="main"
                aria-label="Panel de contenido médico principal"
              >
                {activeSection === 'settings' && (
                  <SettingsPanel
                    doctorName={userName}
                    specialty={doctorSpecialty}
                    licenseNumber={String(doctorLicense)}
                  />
                )}
                {activeSection === 'subscription' && <SubscriptionPanel />}
                {activeSection === 'marketplace' && (
                  <Suspense
                    fallback={
                      <div className="flex h-full items-center justify-center rounded-xl border border-white/[0.04] bg-white/[0.02] p-8 text-slate-600">
                        Cargando marketplace...
                      </div>
                    }
                  >
                    <MarketplacePanel />
                  </Suspense>
                )}
                {activeSection === 'patients' && <PatientsPanel />}
                {activeSection === 'appointments' && <AppointmentsPanel />}
                {activeSection === 'records' && <RecordsPanel />}
                {activeSection === 'vitals' && <VitalSignsPanel />}
                {activeSection === 'chat' && (
                  <div className="flex h-full flex-col items-center justify-center gap-5 rounded-xl border border-white/[0.04] bg-white/[0.02] p-8 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 ring-1 ring-blue-500/10">
                      <MessageSquare className="h-7 w-7 text-blue-400/60" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-slate-200">Chat Médico</h3>
                      <p className="mt-1 text-xs text-slate-600">Comunicación segura con pacientes y colegas</p>
                    </div>
                  </div>
                )}
                {activeSection === 'diagnosis' && <DiagnosisPanel />}
                {activeSection === 'history' && (
                  <div className="flex h-full flex-col items-center justify-center gap-5 rounded-xl border border-white/[0.04] bg-white/[0.02] p-8 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 ring-1 ring-violet-500/10">
                      <Brain className="h-7 w-7 text-violet-400/60" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-slate-200">Historial IA</h3>
                      <p className="mt-1 text-xs text-slate-600">Historial de análisis y recomendaciones</p>
                    </div>
                  </div>
                )}
                {activeSection === 'ranking' && <MedicalRankingPanel />}

                {!activeSection && (
                  <div className="flex min-h-0 flex-1 overflow-hidden">
                    {activeTab === 'video-call' ? (
                      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
                        {children}
                      </div>
                    ) : (
                      <div className="flex min-h-0 w-full flex-1 overflow-y-auto rounded-xl border border-white/[0.04] bg-white/[0.02] p-6">
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
            <footer className="flex items-center justify-between border-t border-white/[0.06] bg-[#0b1628]/60 px-4 py-2 text-[11px] backdrop-blur-sm sm:px-6">
              <div className="flex items-center gap-3 text-slate-600">
                <span className="font-semibold text-slate-400">AutaMedica</span>
                {!statsLoading && stats?.activeCount ? (
                  <>
                    <span className="h-3 w-px bg-white/[0.08]" />
                    <span className="flex items-center gap-1.5 text-emerald-500/80">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/60 animate-pulse" />
                      {stats.activeCount} consulta{stats.activeCount !== 1 ? 's' : ''} activa{stats.activeCount !== 1 ? 's' : ''}
                    </span>
                  </>
                ) : null}
                {stats?.nextAppointment && (
                  <>
                    <span className="hidden h-3 w-px bg-white/[0.08] sm:block" />
                    <span className="hidden sm:inline">
                      Próxima: {stats.nextAppointment.time}
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-slate-500">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-30" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500/60" />
                </span>
                <span className="font-medium">Conectado</span>
              </div>
            </footer>
          </main>
        </div>
      </div>
    </PortalLayoutContext.Provider>
  )
}
