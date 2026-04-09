'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Lock,
  MessageSquareQuote,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  RefreshCcw,
} from 'lucide-react'
import { getClientEnvOrDefault } from '@autamedica/shared'
import { usePatientSession } from '@/hooks/patients/usePatientSession'
import { usePsychiatryIntake } from '@/hooks/patients/usePsychiatryIntake'
import { AnamnesisField as FieldRenderer } from '@/components/patients/anamnesis/AnamnesisField'
import {
  psychiatryPhaseMeta,
  psychiatryPhaseOrder,
} from '@/lib/patients/data/psychiatry-intake-steps'
import { psychiatryIntakePdfService } from '@/lib/patients/services/psychiatry-intake-pdf.service'
import { validateRequiredFields } from '@/lib/patients/usecases/anamnesis-flow.usecase'
import { VoiceAnamnesis } from '@/components/patients/anamnesis/VoiceAnamnesis'
import type { AnamnesisFieldValue } from '@/lib/patients/types/anamnesis'
import type {
  PsychiatryFormData,
  PsychiatryIntakePhase,
  PsychiatryIntakeSection,
} from '@/lib/patients/types/psychiatry-intake'

/* ═══════════════════════════════════════════════════════════════
   Design Tokens — Branding sky-blue system
   ═══════════════════════════════════════════════════════════════ */

const PHASE_ICONS = {
  wizard_intake: FileText,
  conversational_symptoms: MessageSquareQuote,
  wizard_safety: ShieldCheck,
  conversational_closure: Brain,
  completed: CheckCircle2,
} as const

/* ═══════════════════════════════════════════════════════════════
   Helpers (logic unchanged)
   ═══════════════════════════════════════════════════════════════ */

function buildFormData(
  sections: Array<{ section: string; data: Record<string, unknown> }>,
  patientBirthDate: string | null,
): PsychiatryFormData {
  const saved: PsychiatryFormData = {}
  for (const section of sections) {
    saved[section.section] = section.data as Record<string, AnamnesisFieldValue>
  }

  if (patientBirthDate && !saved.contexto_personal?.fecha_nacimiento) {
    saved.contexto_personal = {
      ...saved.contexto_personal,
      fecha_nacimiento: patientBirthDate,
    }
  }

  return saved
}

function getPhaseStart(
  completedSections: string[] | undefined,
  lastPhase: PsychiatryIntakePhase | null | undefined,
): { phaseIndex: number; stepIndex: number } {
  const completed = new Set(completedSections ?? [])

  for (let phaseIndex = 0; phaseIndex < psychiatryPhaseOrder.length; phaseIndex += 1) {
    const phaseId = psychiatryPhaseOrder[phaseIndex]
    if (phaseId === 'completed') {
      continue
    }

    const phase = psychiatryPhaseMeta[phaseId]
    const steps = phase.steps
    const firstPendingIndex = steps.findIndex((step) => !completed.has(step.id))
    if (firstPendingIndex >= 0) {
      return { phaseIndex, stepIndex: firstPendingIndex }
    }
  }

  if (lastPhase && lastPhase !== 'completed') {
    const phaseIndex = psychiatryPhaseOrder.indexOf(lastPhase)
    if (phaseIndex >= 0) {
      return { phaseIndex, stepIndex: 0 }
    }
  }

  return { phaseIndex: psychiatryPhaseOrder.indexOf('completed'), stepIndex: 0 }
}

/* ═══════════════════════════════════════════════════════════════
   Motion variants
   ═══════════════════════════════════════════════════════════════ */

const fadeSlide = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as any },
}

const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.5 },
}

/* ═══════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════ */

export default function PsychiatryIntakePage() {
  const { loading: sessionLoading } = usePatientSession()
  const {
    intake,
    sections,
    progress,
    patientBirthDate,
    loading,
    error,
    authRequired,
    updateIntake,
    updateSection,
  } = usePsychiatryIntake()

  const [phaseIndex, setPhaseIndex] = useState(0)
  const [stepIndex, setStepIndex] = useState(0)
  const [voiceMode, setVoiceMode] = useState(false)
  const [formData, setFormData] = useState<PsychiatryFormData>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const initializedRef = useRef(false)
  const authRedirectStartedRef = useRef(false)

  /* ── Auth redirect ── */
  const redirectToPatientLogin = useCallback(() => {
    if (typeof window === 'undefined' || authRedirectStartedRef.current) {
      return
    }

    authRedirectStartedRef.current = true

    const authOrigin = getClientEnvOrDefault(
      'PUBLIC_APP_URL',
      import.meta.env.MODE === 'production'
        ? 'https://www.autamedica.com'
        : 'http://localhost:3000',
    )
    const loginUrl = new URL('/auth/login', authOrigin)
    loginUrl.searchParams.set('portal', 'patients')
    loginUrl.searchParams.set('returnTo', `${window.location.origin}/patients/psychiatry-tdah`)
    window.location.replace(loginUrl.toString())
  }, [])

  useEffect(() => {
    if (authRequired) {
      redirectToPatientLogin()
    }
  }, [authRequired, redirectToPatientLogin])

  /* ── Initialize from saved data ── */
  useEffect(() => {
    if (loading) {
      return
    }

    setFormData(buildFormData(sections, patientBirthDate))

    if (initializedRef.current) {
      return
    }

    initializedRef.current = true
    const start = getPhaseStart(progress?.completedSections, intake?.lastPhase)
    setPhaseIndex(start.phaseIndex)
    setStepIndex(start.stepIndex)
  }, [loading, sections, patientBirthDate, progress?.completedSections, intake?.lastPhase])

  /* ── Derived state ── */
  const currentPhaseId = psychiatryPhaseOrder[phaseIndex] ?? 'wizard_intake'
  const currentPhase = psychiatryPhaseMeta[currentPhaseId]
  const isCompletedView = currentPhaseId === 'completed' || intake?.status === 'completed'
  const currentStep = !isCompletedView
    ? (currentPhase.steps[stepIndex] ?? currentPhase.steps[0] ?? null)
    : null

  const currentStepData = currentStep ? (formData[currentStep.id] ?? {}) : {}
  const visibleFields = useMemo(() => {
    if (!currentStep || 'field' in currentStep) {
      return []
    }
    return currentStep.fields.filter((field) => {
      if (!field.dependsOn) {
        return true
      }
      return currentStepData[field.dependsOn.fieldId] === field.dependsOn.value
    })
  }, [currentStep, currentStepData])

  const totalCompletedPhases = useMemo(() => {
    const completed = new Set(progress?.completedSections ?? [])
    return psychiatryPhaseOrder.filter((phaseId) => {
      if (phaseId === 'completed') {
        return intake?.status === 'completed'
      }
      const phase = psychiatryPhaseMeta[phaseId]
      return phase.steps.every((step) => completed.has(step.id))
    }).length
  }, [progress?.completedSections, intake?.status])

  const completionPct = progress?.completionPercentage ?? 0

  /* ── Callbacks (logic unchanged) ── */
  const updateField = useCallback((fieldId: string, value: AnamnesisFieldValue) => {
    if (!currentStep) {
      return
    }
    setFormData((prev) => ({
      ...prev,
      [currentStep.id]: {
        ...(prev[currentStep.id] ?? {}),
        [fieldId]: value,
      },
    }))
    setSaveError(null)
  }, [currentStep])

  const persistCurrentStep = useCallback(async (): Promise<boolean> => {
    if (!currentStep) {
      return false
    }

    if ('field' in currentStep) {
      const fieldValue = currentStepData[currentStep.field.id]
      const missing = validateRequiredFields(
        currentStepData,
        [currentStep.field],
      )
      if (missing.length > 0 || fieldValue == null || fieldValue === '') {
        setSaveError(`Completá ${currentStep.field.label.toLowerCase()}.`)
        return false
      }
    } else {
      const missing = validateRequiredFields(currentStepData, visibleFields)
      if (missing.length > 0) {
        setSaveError(`Completá: ${missing.join(', ')}`)
        return false
      }
    }

    setSaving(true)
    setSaveError(null)
    try {
      const saved = await updateSection(
        currentStep.id as PsychiatryIntakeSection,
        currentStepData,
        currentPhaseId === 'completed' ? undefined : currentPhaseId,
      )
      return saved
    } finally {
      setSaving(false)
    }
  }, [currentStep, currentStepData, currentPhaseId, updateSection, visibleFields])

  const moveToPhase = useCallback(async (nextPhaseId: PsychiatryIntakePhase) => {
    const nextPhaseIndex = psychiatryPhaseOrder.indexOf(nextPhaseId)
    if (nextPhaseIndex < 0) {
      return
    }

    setPhaseIndex(nextPhaseIndex)
    setStepIndex(0)
    setVoiceMode(false)
    await updateIntake({
      lastPhase: nextPhaseId,
      privacyAccepted: true,
      termsAccepted: true,
    })
  }, [updateIntake])

  const handleNext = useCallback(async () => {
    const saved = await persistCurrentStep()
    if (!saved) {
      return
    }

    const phaseSteps = currentPhase.steps
    if (stepIndex < phaseSteps.length - 1) {
      setStepIndex((prev) => prev + 1)
      setVoiceMode(false)
      return
    }

    const nextPhaseId = psychiatryPhaseOrder[phaseIndex + 1] ?? 'completed'
    if (nextPhaseId === 'completed') {
      await updateIntake({
        status: 'completed',
        completionPercentage: 100,
        completedAt: new Date().toISOString(),
        lastPhase: 'completed',
      })
      setPhaseIndex(psychiatryPhaseOrder.indexOf('completed'))
      setStepIndex(0)
      return
    }

    await moveToPhase(nextPhaseId)
  }, [currentPhase.steps, moveToPhase, persistCurrentStep, phaseIndex, stepIndex, updateIntake])

  const handlePrev = useCallback(() => {
    if (stepIndex > 0) {
      setStepIndex((prev) => prev - 1)
      setVoiceMode(false)
      return
    }

    if (phaseIndex > 0) {
      const previousPhaseIndex = phaseIndex - 1
      const previousPhaseId = psychiatryPhaseOrder[previousPhaseIndex]
      if (previousPhaseId === 'completed') {
        return
      }
      const previousPhase = psychiatryPhaseMeta[previousPhaseId]
      setPhaseIndex(previousPhaseIndex)
      setStepIndex(Math.max(previousPhase.steps.length - 1, 0))
      setVoiceMode(false)
    }
  }, [phaseIndex, stepIndex])

  const handleDownloadPdf = useCallback(async () => {
    setDownloadingPdf(true)
    try {
      await psychiatryIntakePdfService.downloadPdf()
    } catch {
      setSaveError('No se pudo descargar el PDF. Intentá de nuevo.')
    } finally {
      setDownloadingPdf(false)
    }
  }, [])

  const handleRedo = useCallback(async () => {
    setSaving(true)
    try {
      await updateIntake({
        status: 'in_progress',
        lastPhase: 'wizard_intake',
        completedAt: null,
      })
      setPhaseIndex(0)
      setStepIndex(0)
    } finally {
      setSaving(false)
    }
  }, [updateIntake])

  /* ═══════════════════════════════════════════════════════════════
     RENDER — Loading
     ═══════════════════════════════════════════════════════════════ */

  if (sessionLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#f8fbff] via-white to-[#f0f9ff]">
        <motion.div className="text-center" {...fadeIn}>
          <div className="relative mx-auto h-12 w-12">
            <div className="absolute inset-0 animate-ping rounded-full bg-sky-200/60" />
            <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-lg shadow-sky-100">
              <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
            </div>
          </div>
          <p className="mt-5 text-sm font-medium text-slate-500">
            Preparando tu evaluación...
          </p>
        </motion.div>
      </div>
    )
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER — Locked
     ═══════════════════════════════════════════════════════════════ */

  if (intake?.locked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#f8fbff] via-white to-[#f0f9ff] p-6">
        <motion.div
          className="max-w-md overflow-hidden rounded-3xl border border-sky-100 bg-white/80 p-0 shadow-xl shadow-sky-900/5 backdrop-blur-xl"
          {...fadeSlide}
        >
          <div className="bg-gradient-to-r from-sky-50 to-sky-100/50 px-8 pt-8 pb-6">
            <div className="inline-flex items-center justify-center rounded-2xl bg-white p-3 shadow-sm">
              <Lock className="h-6 w-6 text-sky-500" />
            </div>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">
              Evaluación en revisión
            </h1>
          </div>
          <div className="px-8 pb-8 pt-5">
            <p className="text-sm leading-relaxed text-slate-600">
              Tu evaluación fue enviada al equipo de psiquiatría y está siendo revisada.
              Mientras tanto, no se permiten modificaciones.
            </p>
            <a
              href="/patients/dashboard"
              className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:shadow-md active:scale-[0.98]"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al inicio
            </a>
          </div>
        </motion.div>
      </div>
    )
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDER — Main
     ═══════════════════════════════════════════════════════════════ */

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#f8fbff_0%,#ffffff_50%,#f0f9ff_100%)]">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <motion.div
          className="overflow-hidden rounded-[28px] border border-sky-100/60 bg-white/80 shadow-xl shadow-sky-900/[0.04] backdrop-blur-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* ── Header ── */}
          <div className="relative overflow-hidden border-b border-sky-100/40 px-6 py-8 sm:px-8">
            {/* Decorative gradient orbs */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gradient-to-br from-sky-100/40 to-transparent blur-3xl" />
            <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-gradient-to-tr from-sky-50/60 to-transparent blur-2xl" />

            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-sky-50/80 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-sky-700 backdrop-blur-sm">
                  <Stethoscope className="h-3.5 w-3.5" />
                  Evaluación Psiquiátrica
                </div>
                <h1 className="mt-4 font-heading text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                  Completá tu evaluación
                </h1>
                <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-slate-500">
                  Tus respuestas son confidenciales y nos ayudan a personalizar tu tratamiento.
                  Completá cada sección a tu ritmo.
                </p>
              </div>

              {/* Progress card */}
              <div className="min-w-[200px] rounded-2xl border border-sky-100 bg-gradient-to-b from-white to-sky-50/40 p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Tu avance
                </p>
                <div className="mt-2 flex items-end gap-1.5">
                  <span className="text-4xl font-bold tabular-nums text-sky-600">
                    {completionPct}
                  </span>
                  <span className="mb-1 text-sm font-medium text-slate-400">%</span>
                </div>
                {/* Progress bar */}
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-sky-100/60">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${completionPct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {totalCompletedPhases} de {psychiatryPhaseOrder.length} secciones
                </p>
              </div>
            </div>
          </div>

          {/* ── Phase Stepper ── */}
          <div className="px-4 py-5 sm:px-6">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide sm:grid sm:grid-cols-5 sm:gap-2.5 sm:overflow-visible">
              {psychiatryPhaseOrder.map((phaseId, index) => {
                const phase = psychiatryPhaseMeta[phaseId]
                const Icon = PHASE_ICONS[phaseId]
                const isCurrent = currentPhaseId === phaseId || (isCompletedView && phaseId === 'completed')
                const isPast = index < phaseIndex || (isCompletedView && phaseId !== 'completed')

                return (
                  <div
                    key={phaseId}
                    className={`group relative flex min-w-[140px] flex-col rounded-2xl border px-4 py-3.5 transition-all duration-300 sm:min-w-0 ${
                      isCurrent
                        ? 'border-sky-200 bg-sky-50/80 shadow-sm shadow-sky-100/50'
                        : isPast
                          ? 'border-emerald-100 bg-emerald-50/50'
                          : 'border-slate-100 bg-white/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                        isCurrent
                          ? 'bg-sky-500 text-white shadow-sm shadow-sky-200'
                          : isPast
                            ? 'bg-emerald-100 text-emerald-600'
                            : 'bg-slate-100 text-slate-400'
                      }`}>
                        {isPast ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                      </div>
                      {isCurrent && (
                        <span className="h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
                      )}
                    </div>
                    <p className={`mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                      isCurrent ? 'text-sky-600' : isPast ? 'text-emerald-600' : 'text-slate-400'
                    }`}>
                      {phase.label}
                    </p>
                    <p className={`mt-0.5 text-sm font-medium leading-snug ${
                      isCurrent ? 'text-sky-900' : isPast ? 'text-emerald-800' : 'text-slate-500'
                    }`}>
                      {phase.title}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Form Content ── */}
          {!isCompletedView && currentStep && (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${currentPhaseId}-${stepIndex}`}
                className="grid gap-6 border-t border-sky-100/40 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,1.1fr)] lg:gap-8"
                {...fadeSlide}
              >
                {/* ── Left Sidebar ── */}
                <aside className="space-y-4 rounded-[24px] border border-sky-100/60 bg-gradient-to-b from-sky-50/40 to-white p-5 lg:p-6">
                  <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/70 bg-white/90 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-600">
                    <Sparkles className="h-3 w-3" />
                    {currentPhase.label}
                  </div>
                  <div>
                    <h2 className="font-heading text-2xl font-semibold tracking-tight text-slate-950">
                      {currentPhase.title}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-slate-500">
                      {currentPhase.description}
                    </p>
                  </div>

                  {/* Step indicator */}
                  <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                        Paso {stepIndex + 1} de {currentPhase.steps.length}
                      </p>
                      {/* Step dots */}
                      <div className="flex gap-1.5">
                        {currentPhase.steps.map((_, i) => (
                          <div
                            key={i}
                            className={`h-1.5 rounded-full transition-all duration-300 ${
                              i === stepIndex
                                ? 'w-5 bg-sky-500'
                                : i < stepIndex
                                  ? 'w-1.5 bg-sky-300'
                                  : 'w-1.5 bg-slate-200'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold leading-snug text-slate-900">
                      {currentStep.title}
                    </h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
                      {currentStep.subtitle}
                    </p>
                  </div>

                  {/* Confidentiality note */}
                  <div className="flex items-start gap-3 rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
                    <p className="text-[13px] leading-relaxed text-sky-800/80">
                      Toda la información es estrictamente confidencial y será revisada únicamente por profesionales especializados.
                    </p>
                  </div>
                </aside>

                {/* ── Right Form ── */}
                <section className="rounded-[24px] border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
                  {'field' in currentStep ? (
                    <div className="space-y-5">
                      {/* Conversational header */}
                      <div className="flex flex-col gap-4 rounded-2xl bg-sky-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-600">
                            Contanos
                          </p>
                          <p className="mt-2 text-[15px] font-medium leading-relaxed text-slate-800">
                            {currentStep.field.label}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => setVoiceMode(!voiceMode)}
                          className={`inline-flex min-w-[160px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.97] ${
                            voiceMode
                              ? 'border border-sky-200 bg-white text-sky-600 shadow-sm hover:bg-sky-50'
                              : 'bg-sky-500 text-white shadow-md shadow-sky-200/50 hover:bg-sky-600'
                          }`}
                        >
                          {voiceMode ? 'Escribir manual' : 'Responder con voz'}
                        </button>
                      </div>

                      <div className="rounded-2xl border border-slate-100 p-5">
                        {voiceMode ? (
                          <VoiceAnamnesis
                            guidance={{
                              questions: [{
                                id: currentStep.id,
                                text: `${currentStep.field.label} (${currentStep.subtitle})`,
                                rationale: 'Psychiatry conversational extraction',
                                inputType: 'text',
                                targetSection: currentStep.id,
                                priority: 'high',
                              }],
                              gaps: [],
                              coverageSummary: currentPhase.title,
                              alerts: [],
                              coverage: [],
                              hasCritical: false,
                            }}
                            checkpoint="partial"
                            onDataExtracted={(data) => {
                              const patientLines = data.transcript
                                .filter(e => e.role === 'user')
                                .map(e => e.text)
                                .join(' ')
                                .trim()

                              const summaryToSave = data.chiefComplaint || patientLines || 'Registro de voz completado.'
                              const existing = currentStepData[currentStep.field.id]

                              const finalValue = existing ? `${existing}\n\n[Respuesta por voz]: ${summaryToSave}` : summaryToSave

                              updateField(currentStep.field.id, finalValue)
                              setVoiceMode(false)
                            }}
                            onSwitchToText={() => setVoiceMode(false)}
                          />
                        ) : (
                          <FieldRenderer
                            field={currentStep.field}
                            value={currentStepData[currentStep.field.id] as AnamnesisFieldValue}
                            onChange={(value) => updateField(currentStep.field.id, value)}
                          />
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {visibleFields.map((field) => (
                        <div key={field.id} className="rounded-2xl border border-slate-100 p-5 transition-all hover:border-sky-100 hover:shadow-sm">
                          <div className="mb-3.5">
                            <p className="text-sm font-semibold text-slate-800">{field.label}</p>
                            {field.tooltip && (
                              <p className="mt-1 text-xs text-slate-400">{field.tooltip}</p>
                            )}
                          </div>
                          <FieldRenderer
                            field={field}
                            value={currentStepData[field.id] as AnamnesisFieldValue}
                            onChange={(value) => updateField(field.id, value)}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Error */}
                  {saveError && (
                    <motion.div
                      className="mt-5 rounded-xl border border-red-100 bg-red-50/80 px-4 py-3 text-sm font-medium text-red-600"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      {saveError}
                    </motion.div>
                  )}

                  {/* Navigation */}
                  <div className="mt-8 flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={handlePrev}
                      disabled={phaseIndex === 0 && stepIndex === 0}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Anterior
                    </button>

                    <button
                      type="button"
                      onClick={() => { void handleNext() }}
                      disabled={saving}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-sky-200/40 transition-all hover:bg-sky-600 hover:shadow-lg hover:shadow-sky-200/50 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                      {phaseIndex === psychiatryPhaseOrder.length - 2 && stepIndex === currentPhase.steps.length - 1
                        ? 'Finalizar evaluación'
                        : 'Guardar y continuar'}
                    </button>
                  </div>
                </section>
              </motion.div>
            </AnimatePresence>
          )}

          {/* ── Completed View ── */}
          {isCompletedView && (
            <motion.div
              className="border-t border-sky-100/40 px-6 py-10 sm:px-8"
              {...fadeSlide}
            >
              <div className="mx-auto max-w-3xl overflow-hidden rounded-[28px] border border-emerald-100 bg-gradient-to-b from-emerald-50/50 via-white to-white shadow-lg shadow-emerald-900/[0.03]">
                <div className="px-8 pt-10 pb-2 text-center">
                  <div className="relative mx-auto h-16 w-16">
                    <div className="absolute inset-0 animate-ping rounded-full bg-emerald-100/60 [animation-duration:2s]" />
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                      <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                    </div>
                  </div>
                  <h2 className="mt-6 font-heading text-3xl font-semibold tracking-tight text-slate-950">
                    ¡Evaluación completada!
                  </h2>
                  <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-slate-500">
                    Tu evaluación fue enviada y será revisada por nuestro equipo de psiquiatría.
                    Podés descargar una copia en PDF para tus registros.
                  </p>
                </div>
                <div className="flex flex-col items-center justify-center gap-3 px-8 pb-10 pt-6 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => { void handleDownloadPdf() }}
                    disabled={downloadingPdf}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-200/40 transition-all hover:bg-emerald-600 hover:shadow-lg active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {downloadingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Descargar PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleRedo() }}
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                    Corregir respuestas
                  </button>
                  <a
                    href="/patients/dashboard"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:shadow-md active:scale-[0.98]"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Volver al inicio
                  </a>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Error banner ── */}
          {error && error !== 'unauthorized' && (
            <div className="border-t border-red-100 bg-red-50/80 px-6 py-4 text-sm font-medium text-red-600 sm:px-8">
              {error}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
