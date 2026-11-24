'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Brain, Calendar, CheckCircle2, ClipboardList, Clock, ShieldCheck, Video } from 'lucide-react'
import { fetchApi } from '@/lib/api-client'
import type { AppointmentWithDoctor } from '@/lib/patients/types/appointment'

interface PsychiatryStatusResponse {
  intake: { lastPhase: string; completedAt?: string | null } | null
}

interface ContinuityStatusResponse {
  status: string
  request: { id: string; intent: string; triageStatus: string } | null
}

interface ClinicalClosureStatusResponse {
  status: string
  episode: { id: string; label: string; incidents: Array<{ id: string; status: string }> } | null
}

interface NextStepCardProps {
  anamnesisProgress: number
  upcomingAppointment: AppointmentWithDoctor | null
  dateLocale: string
}

type Step =
  | { type: 'anamnesis' }
  | { type: 'psychiatry' }
  | { type: 'appointment' }
  | { type: 'clinicalClosure' }
  | { type: 'continuity' }
  | { type: 'upcoming'; appointment: AppointmentWithDoctor; hoursUntil: number }

function hoursUntil(dateStr: string): number {
  return Math.round((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60))
}

function deriveStep(
  anamnesisProgress: number,
  psychiatryCompleted: boolean,
  continuityPending: boolean,
  clinicalClosurePending: boolean,
  upcomingAppointment: AppointmentWithDoctor | null,
): Step {
  if (upcomingAppointment) {
    return { type: 'upcoming', appointment: upcomingAppointment, hoursUntil: hoursUntil(upcomingAppointment.start_time) }
  }
  if (clinicalClosurePending) return { type: 'clinicalClosure' }
  if (continuityPending) return { type: 'continuity' }
  if (anamnesisProgress < 80) return { type: 'anamnesis' }
  if (!psychiatryCompleted) return { type: 'psychiatry' }
  return { type: 'appointment' }
}

const STEP_CONFIG = {
  anamnesis: {
    icon: ClipboardList,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    title: { es: 'Completá tu historia clínica', pt: 'Preencha seu histórico clínico' },
    description: {
      es: 'Documentá tus antecedentes para que tu médico te atienda desde el primer minuto.',
      pt: 'Registre seu histórico para que seu médico atenda você desde o primeiro minuto.',
    },
    cta: { es: 'Completar ahora', pt: 'Completar agora' },
    href: '/patients/anamnesis',
    ctaStyle: 'bg-amber-500 hover:bg-amber-600 text-white',
  },
  psychiatry: {
    icon: Brain,
    iconBg: 'bg-rose-50',
    iconColor: 'text-rose-600',
    title: { es: 'Evaluación psiquiátrica disponible', pt: 'Avaliação psiquiátrica disponível' },
    description: {
      es: 'Completá tu evaluación para acceder a consultas con especialistas en salud mental.',
      pt: 'Conclua sua avaliação para acessar consultas com especialistas em saúde mental.',
    },
    cta: { es: 'Iniciar evaluación', pt: 'Iniciar avaliação' },
    href: '/patients/psychiatry',
    ctaStyle: 'bg-rose-500 hover:bg-rose-600 text-white',
  },
  appointment: {
    icon: Calendar,
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-600',
    title: { es: 'Agendá tu consulta', pt: 'Agende sua consulta' },
    description: {
      es: 'Tu perfil está completo. Ya podés reservar una consulta con un especialista.',
      pt: 'Seu perfil está completo. Agora você pode agendar uma consulta com um especialista.',
    },
    cta: { es: 'Ver turnos disponibles', pt: 'Ver horários disponíveis' },
    href: '/patients/appointments',
    ctaStyle: 'bg-sky-500 hover:bg-sky-600 text-white',
  },
  continuity: {
    icon: Clock,
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-600',
    title: { es: 'Tu solicitud está en revisión', pt: 'Sua solicitação está em análise' },
    description: {
      es: 'Un médico está procesando tu solicitud de continuidad de tratamiento.',
      pt: 'Um médico está processando sua solicitação de continuidade de tratamento.',
    },
    cta: { es: 'Ver estado', pt: 'Ver status' },
    href: '/patients/psychiatry/continuity',
    ctaStyle: 'bg-violet-500 hover:bg-violet-600 text-white',
  },
  clinicalClosure: {
    icon: ShieldCheck,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    title: { es: 'Tu caso está en revisión', pt: 'Seu caso está em análise' },
    description: {
      es: 'Tu médico está revisando si ya podés cerrar esta consulta. Esta revisión ya está incluida.',
      pt: 'Seu médico está avaliando se já é possível encerrar esta consulta. Esta revisão já está incluída.',
    },
    cta: { es: 'Ver estado', pt: 'Ver status' },
    href: '/patients/appointments',
    ctaStyle: 'bg-emerald-500 hover:bg-emerald-600 text-white',
  },
} as const

export default function NextStepCard({ anamnesisProgress, upcomingAppointment, dateLocale }: NextStepCardProps) {
  const [psychiatryCompleted, setPsychiatryCompleted] = useState(false)
  const [continuityPending, setContinuityPending] = useState(false)
  const [clinicalClosurePending, setClinicalClosurePending] = useState(false)
  const [ready, setReady] = useState(false)

  const fetchStatuses = useCallback(async () => {
    const [psychiatryRes, continuityRes, clinicalClosureRes] = await Promise.allSettled([
      fetchApi<PsychiatryStatusResponse>('/api/patients/psychiatry-intake'),
      fetchApi<ContinuityStatusResponse>('/api/patients/psychiatry/continuity-request'),
      fetchApi<ClinicalClosureStatusResponse>('/api/patients/clinical-closure/status'),
    ])

    if (psychiatryRes.status === 'fulfilled') {
      const { intake } = psychiatryRes.value
      setPsychiatryCompleted(intake?.lastPhase === 'completed' || !!intake?.completedAt)
    }

    if (continuityRes.status === 'fulfilled') {
      const { status, request } = continuityRes.value
      const triageStatus = request?.triageStatus
      // Only show continuity card if there is a real continuity/renewal request (not evaluation)
      const intent = request?.intent
      setContinuityPending(
        status !== 'none' && !!request?.id && !!triageStatus && triageStatus !== 'resolved'
          && (intent === 'continuity' || intent === 'renewal'),
      )
    }

    if (clinicalClosureRes.status === 'fulfilled') {
      setClinicalClosurePending(clinicalClosureRes.value.status === 'medical_validation_pending')
    }

    setReady(true)
  }, [])

  useEffect(() => { void fetchStatuses() }, [fetchStatuses])

  if (!ready) return null

  const step = deriveStep(anamnesisProgress, psychiatryCompleted, continuityPending, clinicalClosurePending, upcomingAppointment)
  const lang = dateLocale.toLowerCase().startsWith('pt') ? 'pt' : 'es'

  if (step.type === 'upcoming') {
    const { appointment, hoursUntil: hours } = step
    const doctorName = appointment.doctor
      ? `Dr. ${appointment.doctor.first_name ?? ''} ${appointment.doctor.last_name ?? ''}`.trim()
      : (lang === 'pt' ? 'seu médico' : 'tu médico')
    const timeLabel =
      hours <= 0
        ? (lang === 'pt' ? 'Consulta em andamento' : 'Consulta en curso')
        : hours === 1
          ? (lang === 'pt' ? 'em 1 hora' : 'en 1 hora')
          : (lang === 'pt' ? `em ${hours} horas` : `en ${hours} horas`)

    return (
      <div className="mb-6 overflow-hidden rounded-2xl border border-sky-100 bg-sky-50/60 p-5">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-sky-500">
          {lang === 'pt' ? 'Seu próximo passo' : 'Tu próximo paso'}
        </p>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100">
            <Video className="h-[18px] w-[18px] text-sky-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900">
              {lang === 'pt' ? `Consulta com ${doctorName}` : `Consulta con ${doctorName}`}
            </p>
            <p className="mt-0.5 text-sm text-gray-500">
              {new Intl.DateTimeFormat(dateLocale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(appointment.start_time))}
              {' · '}
              <span className="font-medium text-sky-600">{timeLabel}</span>
            </p>
            <a
              href="/patients/appointments"
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-sky-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-sky-600 transition-colors"
            >
              <Video className="h-3.5 w-3.5" />
              {lang === 'pt' ? 'Entrar na videochamada' : 'Entrar a la videollamada'}
            </a>
          </div>
        </div>
      </div>
    )
  }

  const config = STEP_CONFIG[step.type]
  const StepIcon = config.icon

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">
        {lang === 'pt' ? 'Seu próximo passo' : 'Tu próximo paso'}
      </p>
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${config.iconBg}`}>
          <StepIcon className={`h-[18px] w-[18px] ${config.iconColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900">{config.title[lang]}</p>
          <p className="mt-0.5 text-sm text-gray-500">{config.description[lang]}</p>
          <a
            href={config.href}
            className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${config.ctaStyle}`}
          >
            {config.cta[lang]}
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  )
}

const QUICK_LINKS = [
  { label: 'Historial médico', href: '/patients/medical-history', icon: CheckCircle2, color: 'text-emerald-600' },
  { label: 'Comunidad', href: '/patients/community', icon: Clock, color: 'text-fuchsia-600' },
  { label: 'Evaluación psiquiátrica', href: '/patients/psychiatry', icon: Brain, color: 'text-rose-600' },
] as const

export function QuickLinks() {
  return (
    <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
      {QUICK_LINKS.map(({ label, href, icon: Icon, color }) => (
        <a
          key={href}
          href={href}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-gray-100 bg-white px-3.5 py-2 text-xs font-medium text-gray-700 shadow-sm transition-all hover:border-gray-200 hover:shadow-md"
        >
          <Icon className={`h-3.5 w-3.5 ${color}`} />
          {label}
        </a>
      ))}
    </div>
  )
}
