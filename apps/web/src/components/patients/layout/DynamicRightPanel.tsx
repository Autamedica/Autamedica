'use client'

import {
    BloodPressureModal,
    CommunityPostModal,
    LabResultModal,
    MedicationModal,
    SymptomModal,
} from '@/components/patients/quick-actions/QuickActionModals'
import { type CommunityPost, useCommunityPosts } from '@/hooks/patients/useCommunity'
import { usePatientScreenings } from '@/hooks/patients/usePatientScreenings'
import { usePatientSession } from '@/hooks/patients/usePatientSession'
import { computeAgeFromIso, normalizeGender } from '@/lib/patients/lib/demographics'
import {
    Activity,
    AlertTriangle,
    Clock,
    Eye,
    FileText,
    Heart,
    MessageSquare,
    Pill,
    Shield,
    TrendingUp,
    Zap,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'

type PanelTab = 'brief' | 'community' | 'actions' | 'medical' | 'chat'

interface DynamicRightPanelProps {
  context?: 'dashboard' | 'video' | 'appointments' | 'history'
  locale?: string
}

type PanelContext = NonNullable<DynamicRightPanelProps['context']>

interface TabConfig {
  id: PanelTab
  label: string
  icon: typeof Activity
}

type QuickActionModalKey =
  | 'blood-pressure'
  | 'medication'
  | 'symptom'
  | 'lab-result'
  | 'community-post'

const statusRank = {
  overdue: 0,
  due_soon: 1,
  up_to_date: 2,
} as const

const editorialReading = [
  {
    section: 'Prevencion',
    title: 'Como leer una tendencia de presion arterial en casa',
    summary: 'Evita decisiones aisladas: importa mas la tendencia semanal que una unica toma.',
  },
  {
    section: 'Consulta',
    title: 'Tres preguntas para aprovechar mejor la videoconsulta',
    summary: 'Lleva contexto concreto para obtener indicaciones utiles y accionables.',
  },
  {
    section: 'Seguridad',
    title: 'Que datos compartir en comunidad y cuales reservar para consulta',
    summary: 'Participa con confianza sin exponer informacion clínica sensible.',
  },
]

function tabsForContext(context: PanelContext): TabConfig[] {
  switch (context) {
    case 'video':
      return [
        { id: 'chat', label: 'Conversacion', icon: MessageSquare },
        { id: 'medical', label: 'Contexto', icon: FileText },
      ]
    case 'appointments':
      return [
        { id: 'brief', label: 'Preparacion', icon: FileText },
        { id: 'actions', label: 'Registro', icon: Zap },
      ]
    case 'history':
      return [
        { id: 'medical', label: 'Tendencias', icon: TrendingUp },
        { id: 'actions', label: 'Accesos', icon: Eye },
      ]
    default:
      return [
        { id: 'brief', label: 'Resumen', icon: FileText },
        { id: 'community', label: 'Comunidad', icon: MessageSquare },
        { id: 'actions', label: 'Registro', icon: Activity },
      ]
  }
}

function defaultTabForContext(context: PanelContext): PanelTab {
  switch (context) {
    case 'video':
      return 'chat'
    case 'history':
      return 'medical'
    default:
      return 'brief'
  }
}

export function DynamicRightPanel({ context = 'dashboard', locale }: DynamicRightPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>(() => defaultTabForContext(context))
  const tabs = useMemo(() => tabsForContext(context), [context])

  useEffect(() => {
    setActiveTab(defaultTabForContext(context))
  }, [context])

  return (
    <aside className="relative flex w-[30%] min-w-[320px] max-w-[400px] flex-col border-l border-slate-200/50 bg-white/40 shadow-xl shadow-indigo-900/5 backdrop-blur-2xl">
      <div className="border-b border-indigo-100/50 bg-white/60 px-5 py-4 backdrop-blur-md">
        <p className="inline-flex rounded-full bg-indigo-100/50 px-2.5 py-1 text-[10px] font-bold tracking-wider text-indigo-700 uppercase">Panel de contexto</p>
        <p className="mt-2 text-xs font-medium leading-relaxed text-slate-600">
          Información priorizada para decidir con criterio junto al equipo médico.
        </p>
      </div>

      <div className="flex border-b border-slate-200/60 bg-white/40 backdrop-blur-sm">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                group flex flex-1 items-center justify-center gap-2 px-3 py-3.5 text-[11px] font-bold uppercase tracking-wider transition-all duration-300
                ${
                  isActive
                    ? 'border-b-2 border-indigo-600 bg-indigo-50/50 text-indigo-700 shadow-[inset_0_-1px_0_0_rgba(79,70,229,0.1)]'
                    : 'border-b-2 border-transparent text-slate-500 hover:bg-slate-50/50 hover:text-slate-700'
                }
              `}
            >
              <Icon className={`h-4 w-4 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'brief' && <DailyBriefPanel locale={locale} />}
        {activeTab === 'community' && <CommunityPanel />}
        {activeTab === 'actions' && <ClinicalLogPanel />}
        {activeTab === 'medical' && <MedicalContextPanel />}
        {activeTab === 'chat' && <ChatPanel />}
      </div>
    </aside>
  )
}

function DailyBriefPanel({ locale }: { locale?: string }) {
  const { user, profile, patient } = usePatientSession()

  const birthDate = patient?.birthDate ?? null
  const age = computeAgeFromIso(birthDate) ?? 52
  const normalizedGender = normalizeGender(patient?.gender ?? null) ?? 'male'
  const { screenings, stats } = usePatientScreenings(age, normalizedGender)

  const pendingScreenings = useMemo(
    () =>
      screenings
        .filter((screening) => screening.status !== 'up_to_date')
        .sort((left, right) => statusRank[left.status] - statusRank[right.status])
        .slice(0, 3),
    [screenings],
  )

  const metadata = user?.user_metadata as Record<string, unknown> | undefined
  const metadataName = typeof metadata?.full_name === 'string' ? metadata.full_name : undefined
  const profileName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim()
  const fallbackName = user?.email?.split('@')[0] ?? 'Paciente'
  const preferredName = (profileName || metadataName || fallbackName).split(' ')[0]

  const dateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'pt' ? 'pt-BR' : 'es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(new Date()),
    [locale],
  )

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-indigo-100/50 bg-white/40 p-5 shadow-sm backdrop-blur-md">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-white/20" />
        <div className="relative">
          <p className="inline-flex rounded-full bg-indigo-100/50 px-2 py-0.5 text-[10px] font-bold tracking-wider text-indigo-700 uppercase">Brief diario</p>
          <h3 className="mt-3 text-lg font-bold text-slate-900 leading-tight">
            {preferredName}, aquí tienes lo importante del día
          </h3>
          <p className="mt-2 text-xs font-medium leading-relaxed text-slate-600">
            {dateLabel}. Esta vista prioriza evidencia y contexto. La decisión final siempre es tuya.
          </p>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2">
        <SummaryMetric label="Al dia" value={`${stats.upToDate}/${stats.total}`} />
        <SummaryMetric label="Por vencer" value={`${stats.dueSoon}`} />
        <SummaryMetric label="Atrasados" value={`${stats.overdue}`} highlight={stats.overdue > 0} />
      </section>

      <section>
        <p className="mb-3 text-[11px] font-bold tracking-wider text-slate-500 uppercase">Prioridades clínicas</p>
        <div className="space-y-3">
          {pendingScreenings.length === 0 && (
            <div className="rounded-xl border border-emerald-200/50 bg-emerald-50/50 p-4 text-xs font-medium text-emerald-800 backdrop-blur-sm shadow-sm flex gap-3 items-center">
              <div className="flex bg-emerald-100/50 h-8 w-8 rounded-full items-center justify-center shrink-0 text-emerald-600"><Heart className="h-4 w-4" /></div>
              No hay alertas pendientes. Mantené tu seguimiento con la misma frecuencia.
            </div>
          )}

          {pendingScreenings.map((screening) => (
            <article key={screening.id} className="rounded-lg border border-stone-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-stone-900">{screening.title}</p>
                <span className={statusPillClass(screening.status)}>
                  {screeningStatusLabel(screening.status)}
                </span>
              </div>
              <p className="mt-1 text-xs text-stone-600">
                Siguiente fecha sugerida: {screening.next_due_date}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="pt-2">
        <p className="mb-3 text-[11px] font-bold tracking-wider text-slate-500 uppercase">Lectura recomendada</p>
        <div className="space-y-3">
          {editorialReading.map((item) => (
            <article key={item.title} className="group cursor-pointer rounded-xl border border-blue-100/50 bg-white/40 p-4 shadow-sm backdrop-blur-sm transition-all duration-300 hover:border-blue-200 hover:bg-white/60 hover:shadow-md hover:shadow-blue-500/5">
              <p className="inline-flex items-center text-[10px] font-bold uppercase tracking-widest text-blue-500">
                {item.section}
              </p>
              <h4 className="mt-1.5 text-sm font-bold text-slate-900 leading-snug group-hover:text-blue-700 transition-colors">{item.title}</h4>
              <p className="mt-1.5 text-xs font-medium leading-relaxed text-slate-600">{item.summary}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function CommunityPanel() {
  const { posts, loading, error, refetch } = useCommunityPosts(5)
  const [showCreatePost, setShowCreatePost] = useState(false)

  const handlePostCreated = () => {
    setShowCreatePost(false)
    refetch()
  }

  return (
    <>
      <div className="space-y-5">
        <div className="relative overflow-hidden rounded-2xl border border-pink-100/50 bg-white/40 p-5 shadow-sm backdrop-blur-md">
          <div className="absolute inset-0 bg-gradient-to-br from-pink-50/50 to-white/20" />
          <div className="relative">
            <p className="inline-flex rounded-full bg-pink-100/50 px-2 py-0.5 text-[10px] font-bold tracking-wider text-pink-700 uppercase">Comunidad</p>
            <h3 className="mt-3 text-lg font-bold text-slate-900 leading-tight">
              Conversaciones entre pacientes
            </h3>
            <p className="mt-2 text-xs font-medium leading-relaxed text-slate-600">
              Espacio para compartir experiencias y preparar mejores preguntas para tu consulta.
            </p>
          </div>
        </div>

        {loading && (
          <div className="py-8 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-stone-900"></div>
            <p className="mt-2 text-xs text-stone-600">Cargando conversaciones...</p>
          </div>
        )}

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">{error}</div>}

        {!loading && !error && posts.length === 0 && (
          <div className="rounded-lg border border-stone-200 bg-white p-4 text-center">
            <MessageSquare className="mx-auto mb-2 h-8 w-8 text-stone-400" />
            <p className="text-sm text-stone-700">Aun no hay publicaciones recientes.</p>
            <p className="mt-1 text-xs text-stone-500">Podes abrir una conversacion cuando lo necesites.</p>
          </div>
        )}

        {!loading && !error && posts.length > 0 && (
          <div className="space-y-3">
            {posts.map((post) => (
              <CommunityPostCard key={post.id} post={post} />
            ))}
          </div>
        )}

        <button onClick={() => setShowCreatePost(true)} className="w-full btn-primary-ivory py-2.5 text-sm">
          Compartir experiencia
        </button>
      </div>

      <CommunityPostModal
        isOpen={showCreatePost}
        onClose={() => setShowCreatePost(false)}
        onSuccess={handlePostCreated}
      />
    </>
  )
}

function ClinicalLogPanel() {
  const [activeModal, setActiveModal] = useState<QuickActionModalKey | null>(null)

  return (
    <>
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-2xl border border-amber-100/50 bg-white/40 p-5 shadow-sm backdrop-blur-md">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-50/50 to-white/20" />
          <div className="relative">
            <p className="inline-flex rounded-full bg-amber-100/50 px-2 py-0.5 text-[10px] font-bold tracking-wider text-amber-700 uppercase">Registro clínico</p>
            <h3 className="mt-3 text-lg font-bold text-slate-900 leading-tight">
              Captura datos útiles para tu próxima consulta
            </h3>
          </div>
        </div>

        <ActionButton
          icon={<Activity className="h-4 w-4" />}
          label="Registrar presion arterial"
          description="Medicion puntual para seguir tendencia."
          onClick={() => setActiveModal('blood-pressure')}
          dataTour="action-blood-pressure"
        />
        <ActionButton
          icon={<Pill className="h-4 w-4" />}
          label="Confirmar medicamento"
          description="Deja trazabilidad de adherencia."
          onClick={() => setActiveModal('medication')}
          dataTour="action-medication"
        />
        <ActionButton
          icon={<FileText className="h-4 w-4" />}
          label="Registrar sintoma"
          description="Contexto clinico para la consulta."
          onClick={() => setActiveModal('symptom')}
          dataTour="action-symptom"
        />
        <ActionButton
          icon={<TrendingUp className="h-4 w-4" />}
          label="Subir resultado"
          description="Adjunta laboratorio o estudios previos."
          onClick={() => setActiveModal('lab-result')}
          dataTour="action-lab-result"
        />
        <ActionButton
          icon={<MessageSquare className="h-4 w-4" />}
          label="Publicar en comunidad"
          description="Consulta experiencias de otros pacientes."
          onClick={() => setActiveModal('community-post')}
          dataTour="action-community-post"
        />
      </div>

      <BloodPressureModal isOpen={activeModal === 'blood-pressure'} onClose={() => setActiveModal(null)} />
      <MedicationModal isOpen={activeModal === 'medication'} onClose={() => setActiveModal(null)} />
      <SymptomModal isOpen={activeModal === 'symptom'} onClose={() => setActiveModal(null)} />
      <LabResultModal isOpen={activeModal === 'lab-result'} onClose={() => setActiveModal(null)} />
      <CommunityPostModal isOpen={activeModal === 'community-post'} onClose={() => setActiveModal(null)} />
    </>
  )
}

function MedicalContextPanel() {
  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-teal-100/50 bg-white/40 p-5 shadow-sm backdrop-blur-md">
        <div className="absolute inset-0 bg-gradient-to-br from-teal-50/50 to-white/20" />
        <div className="relative">
          <p className="inline-flex rounded-full bg-teal-100/50 px-2 py-0.5 text-[10px] font-bold tracking-wider text-teal-700 uppercase">Contexto clínico</p>
          <h3 className="mt-3 text-lg font-bold text-slate-900 leading-tight">Resumen operativo del paciente</h3>
        </div>
      </div>

      <section>
        <p className="mb-3 text-[11px] font-bold tracking-wider text-slate-500 uppercase">Signos vitales</p>
        <div className="space-y-3">
          <VitalSign
            icon={<Heart className="h-5 w-5 text-rose-500" />}
            label="Presion arterial"
            value="120/80"
            status="Dentro de rango esperado"
            statusClassName="text-emerald-700"
          />
          <VitalSign
            icon={<Activity className="h-5 w-5 text-blue-500" />}
            label="Frecuencia cardiaca"
            value="72 lpm"
          />
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
          Medicacion de hoy
        </p>
        <div className="space-y-2">
          <MedicationItem name="Lisinopril 10 mg" time="Tomado" completed />
          <MedicationItem name="Metformina 500 mg" time="14:00" />
          <MedicationItem name="Aspirina 100 mg" time="20:00" />
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Alergias declaradas</p>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-700" />
            <span className="text-sm font-medium text-red-900">Penicilina</span>
          </div>
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Accesos a historia</p>
        <div className="space-y-2">
          <AccessLog doctor="Dr. Garcia" specialty="Cardiologia" views={12} />
          <AccessLog doctor="Dra. Martinez" specialty="Medicina general" views={8} />
        </div>
        <button className="mt-2 w-full rounded-lg border border-stone-300 bg-stone-100 py-2 text-xs font-medium text-stone-700 transition hover:bg-stone-200">
          <Eye className="mr-2 inline-block h-3 w-3" />
          Ver historial completo
        </button>
      </section>
    </div>
  )
}

function ChatPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="relative overflow-hidden rounded-2xl border border-sky-100/50 bg-white/40 p-5 shadow-sm backdrop-blur-md">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-50/50 to-white/20" />
        <div className="relative">
          <p className="inline-flex rounded-full bg-sky-100/50 px-2 py-0.5 text-[10px] font-bold tracking-wider text-sky-700 uppercase">Consulta activa</p>
          <h3 className="mt-3 text-lg font-bold text-slate-900 leading-tight">Canal de conversación clínica</h3>
        </div>
      </div>

      <div className="mt-4 flex-1 space-y-3 overflow-y-auto">
        <ChatMessage sender="Dr. Garcia" message="Como estuvo tu presion arterial esta semana?" />
        <ChatMessage sender="Tu" message="Se mantuvo estable, entre 118/78 y 122/81." isOwn />
      </div>

      <div className="mt-4">
        <input
          type="text"
          placeholder="Escribe tu mensaje..."
          className="w-full rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-900 placeholder-stone-500 focus:border-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-700/20"
        />
      </div>
    </div>
  )
}

function screeningStatusLabel(status: 'overdue' | 'due_soon' | 'up_to_date'): string {
  if (status === 'overdue') return 'Atrasado'
  if (status === 'due_soon') return 'Por vencer'
  return 'Al dia'
}

function statusPillClass(status: 'overdue' | 'due_soon' | 'up_to_date'): string {
  if (status === 'overdue') {
    return 'rounded-full bg-red-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-red-700'
  }
  if (status === 'due_soon') {
    return 'rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-700'
  }
  return 'rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700'
}

function SummaryMetric({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div
      className={`relative overflow-hidden flex flex-col items-center rounded-2xl border p-4 shadow-sm backdrop-blur-sm transition-all duration-300 ${
        highlight
          ? 'border-rose-200/50 bg-rose-50/40 text-rose-900'
          : 'border-slate-200/50 bg-white/40 text-slate-900 hover:bg-white/60'
      }`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${highlight ? 'from-rose-100/30' : 'from-slate-50/30'} to-transparent`} />
      <span className="relative text-2xl font-extrabold tracking-tight">{value}</span>
      <span className="relative mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </span>
    </div>
  )
}

function CommunityPostCard({ post }: { post: CommunityPost }) {
  const groupName = post.group?.name ?? 'Grupo'
  const members = post.group?.member_count ?? 0
  const author = post.is_anonymous ? 'Anonimo' : post.author_display_name ?? 'Paciente'

  return (
    <article className="rounded-lg border border-stone-200 bg-white p-3 transition hover:bg-stone-50">
      <div className="mb-2 flex items-center gap-2 text-xs text-stone-600">
        <Shield className="h-3 w-3" />
        <span>
          {groupName} ({members} miembros)
        </span>
      </div>
      <p className="mb-1 text-xs font-medium text-stone-700">{author}</p>
      <p className="mb-3 text-sm text-stone-900">{post.title}</p>
      <div className="flex items-center gap-4 text-xs text-stone-600">
        <span>💬 {post.comment_count} respuestas</span>
        <span>👍 {post.reaction_count}</span>
      </div>
    </article>
  )
}

function ActionButton({
  icon,
  label,
  description,
  onClick,
  dataTour,
}: {
  icon: ReactNode
  label: string
  description: string
  onClick: () => void
  dataTour?: string
}) {
  return (
    <button
      onClick={onClick}
      data-tour={dataTour}
      className="w-full rounded-lg border border-stone-200 bg-white px-4 py-3 text-left transition hover:border-stone-400 hover:bg-stone-50"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-stone-700">{icon}</span>
        <div>
          <p className="text-sm font-semibold text-stone-900">{label}</p>
          <p className="mt-0.5 text-xs text-stone-600">{description}</p>
        </div>
      </div>
    </button>
  )
}

function VitalSign({
  icon,
  label,
  value,
  status,
  statusClassName,
}: {
  icon: ReactNode
  label: string
  value: string
  status?: string
  statusClassName?: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-3">
      <div>{icon}</div>
      <div className="flex-1">
        <p className="text-xs text-stone-600">{label}</p>
        <p className="text-lg font-semibold text-stone-900">{value}</p>
        {status && <p className={`text-xs ${statusClassName ?? 'text-stone-600'}`}>{status}</p>}
      </div>
    </div>
  )
}

function MedicationItem({ name, time, completed = false }: { name: string; time: string; completed?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg border p-2 ${
        completed ? 'border-emerald-200 bg-emerald-50' : 'border-stone-200 bg-white'
      }`}
    >
      <div className="flex items-center gap-2">
        {completed ? (
          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600">
            <span className="text-[10px] text-white">✓</span>
          </div>
        ) : (
          <Clock className="h-4 w-4 text-amber-600" />
        )}
        <span className="text-sm text-stone-900">{name}</span>
      </div>
      <span className={`text-xs ${completed ? 'font-semibold text-emerald-700' : 'text-stone-600'}`}>{time}</span>
    </div>
  )
}

function AccessLog({ doctor, specialty, views }: { doctor: string; specialty: string; views: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-white p-2">
      <div>
        <p className="text-sm font-medium text-stone-900">{doctor}</p>
        <p className="text-xs text-stone-600">{specialty}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold text-stone-900">{views}</p>
        <p className="text-[10px] text-stone-500">veces</p>
      </div>
    </div>
  )
}

function ChatMessage({ sender, message, isOwn = false }: { sender: string; message: string; isOwn?: boolean }) {
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-lg border p-3 ${
          isOwn ? 'border-stone-300 bg-stone-100' : 'border-stone-200 bg-white'
        }`}
      >
        <p className="mb-1 text-xs font-medium text-stone-600">{sender}</p>
        <p className="text-sm text-stone-900">{message}</p>
      </div>
    </div>
  )
}
