'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Loader2,
  Lock,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Sparkles,
  Stethoscope,
  Timer,
} from 'lucide-react'
import { getClientEnvOrDefault } from '@autamedica/shared'
import { usePatientSession } from '@/hooks/patients/usePatientSession'
import { usePsychiatryIntake } from '@/hooks/patients/usePsychiatryIntake'
import { useClinicalState } from '@/hooks/patients/useClinicalState'
import { AnamnesisField as FieldRenderer } from '@/components/patients/anamnesis/AnamnesisField'
import {
  psychiatryPhaseMeta,
  psychiatryPhaseOrder,
} from '@/lib/patients/data/psychiatry-intake-steps'
import { psychiatryIntakePdfService } from '@/lib/patients/services/psychiatry-intake-pdf.service'
import { validateRequiredFields } from '@/lib/patients/usecases/anamnesis-flow.usecase'
import { VoiceAnamnesis } from '@/components/patients/anamnesis/VoiceAnamnesis'
import { ClinicalFieldWrapper } from '@/components/patients/intake/ClinicalFieldWrapper'
import CompletedGreenView from '@/components/patients/CompletedGreenView'
import type { AnamnesisFieldValue } from '@/lib/patients/types/anamnesis'
import type {
  PsychiatryFormData,
  PsychiatryIntakePhase,
  PsychiatryIntakeSection,
} from '@/lib/patients/types/psychiatry-intake'
import type { SegmentKey } from '@/lib/patients/clinical-state/types'

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

/** Map step IDs to canonical segment keys */
const STEP_TO_SEGMENT: Record<string, SegmentKey> = {
  contexto_personal: 'identity',
  datos_demograficos: 'identity',
  consulta_actual: 'intake_context',
  motivo_consulta: 'intake_context',
  medicacion_actual: 'current_medication',
  medicacion: 'current_medication',
  sintomas_actuales: 'symptoms',
  sintomas: 'symptoms',
  seguridad: 'safety',
  impacto_funcional: 'functional_impact',
  historial: 'history',
  cierre_clinico: 'review',
  relato_clinico: 'review',
}

export default function PsychiatryIntakePage() {
  const { loading: sessionLoading, patient } = usePatientSession()
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

  // ── Canonical Clinical State ──
  const {
    clinicalState,
    mergeFormData: mergeIntoClinicalState,
    mergeVoiceData,
    getCanonicalField,
    getFieldUiState,
    hydrateStepData,
    confirmField,
    getPlannedQuestions,
    getPromptSnapshot,
    getVoiceContext,
    persistNow: persistClinicalState,
  } = useClinicalState({
    patientId: patient?.id ?? null,
    caseId: intake?.id ?? null,
    workflowType: formData?.consulta_actual?.tipo_atencion === 'continuidad'
      ? 'psychiatry_continuity'
      : formData?.consulta_actual?.tipo_atencion === 'revision_urgente'
        ? 'psychiatric_urgency'
        : formData?.consulta_actual?.tipo_atencion === 'primera_consulta'
          ? 'psychiatry_first_visit'
          : 'general_consultation',
    sections,
    loading,
  })

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
    loginUrl.searchParams.set('returnTo', `${window.location.origin}/patients/psychiatry`)
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

  const currentStepDraft = currentStep ? (formData[currentStep.id] ?? {}) : {}
  const currentStepData = useMemo(() => {
    if (!currentStep) return {} as Record<string, AnamnesisFieldValue>
    return hydrateStepData(currentStep.id, currentStepDraft) as Record<string, AnamnesisFieldValue>
  }, [currentStep, currentStepDraft, hydrateStepData])

  const currentVoiceContext = useMemo(() => {
    if (!currentStep) return null
    const segment = STEP_TO_SEGMENT[currentStep.id]
    return segment ? getVoiceContext(segment) : null
  }, [currentStep, getVoiceContext])

  const visibleFields = useMemo(() => {
    if (!currentStep || 'field' in currentStep) {
      return []
    }
    return currentStep.fields.filter((field) => {
      if (!field.dependsOn) {
        return true
      }
      const depValue = field.dependsOn.value
      const actualValue = currentStepData[field.dependsOn.fieldId]
      if (Array.isArray(depValue)) {
        return depValue.some((value) => value === actualValue)
      }
      return actualValue === depValue
    })
  }, [currentStep, currentStepData])

  /**
   * Step statuses from canonical state.
   * For each step in the current phase, compute whether it's
   * fully confirmed (locked), needs confirmation, has conflicts, or is pending.
   */
  type StepStatus = 'locked' | 'conflict' | 'confirm' | 'pending'
  const stepStatuses: StepStatus[] = useMemo(() => {
    if (!currentPhase?.steps) return []

    return currentPhase.steps.map((step: { id: string; fields?: Array<{ id: string }>; field?: { id: string } }) => {
      const fieldIds = 'field' in step && step.field
        ? [step.field.id]
        : (step.fields ?? []).map((f: { id: string }) => f.id)

      if (fieldIds.length === 0) return 'pending'

      let allLocked = true
      let hasConflict = false
      let hasConfirm = false

      for (const fid of fieldIds) {
        const uxState = getFieldUiState(fid, step.id)

        if (uxState.mode === 'conflict') {
          hasConflict = true
          allLocked = false
        } else if (uxState.mode === 'confirm') {
          hasConfirm = true
          allLocked = false
        } else if (uxState.mode !== 'locked') {
          allLocked = false
        }
      }

      if (hasConflict) return 'conflict'
      if (allLocked) return 'locked'
      if (hasConfirm) return 'confirm'
      return 'pending'
    })
  }, [currentPhase?.steps, getFieldUiState])

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

    // Sync canonical clinical state
    const segment = STEP_TO_SEGMENT[currentStep.id]
    if (segment) {
      mergeIntoClinicalState({ [fieldId]: value }, segment)
    }
  }, [currentStep, mergeIntoClinicalState])

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

      // Persist canonical clinical state alongside section save
      if (saved) {
        await persistClinicalState()
      }

      return saved
    } finally {
      setSaving(false)
    }
  }, [currentStep, currentStepData, currentPhaseId, updateSection, visibleFields, persistClinicalState])

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
      // Smart skip: find the next step that isn't fully locked
      let nextIdx = stepIndex + 1
      while (nextIdx < phaseSteps.length - 1 && stepStatuses[nextIdx] === 'locked') {
        nextIdx++
      }
      setStepIndex(nextIdx)
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
  }, [currentPhase.steps, moveToPhase, persistCurrentStep, phaseIndex, stepIndex, stepStatuses, updateIntake])

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

              <div className="flex w-full flex-col sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-sky-50/80 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-sky-700 backdrop-blur-sm">
                    <Stethoscope className="h-3.5 w-3.5" />
                    {formData?.consulta_actual?.tipo_atencion === 'continuidad'
                      ? 'Renovación de Tratamiento'
                      : 'Evaluación Psiquiátrica'}
                  </div>
                  <h1 className="mt-4 font-heading text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                    {formData?.consulta_actual?.tipo_atencion === 'continuidad'
                      ? 'Continuidad de tratamiento'
                      : 'Completá tu evaluación'}
                  </h1>
                </div>

                {/* Minimal Time Estimator */}
                <div className="mt-4 sm:mt-0">
                  <div className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-2 shadow-sm">
                    <Timer className="h-4 w-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-600">
                      {Math.max(1, currentPhase.steps.length - stepIndex)} pasos restantes
                    </span>
                  </div>
                </div>
              </div>
            </div>

          {/* ── Clinical Triage Alert ── */}
          {clinicalState?.triage && (clinicalState.triage.priority === 'urgent' || clinicalState.triage.priority === 'priority') && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className={`border-b px-6 py-4 sm:px-8 ${
                clinicalState.triage.priority === 'urgent'
                  ? 'bg-red-50 border-red-100'
                  : 'bg-amber-50 border-amber-100'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 rounded-full p-1.5 ${
                  clinicalState.triage.priority === 'urgent' ? 'bg-red-100' : 'bg-amber-100'
                }`}>
                  <Sparkles className={`h-4 w-4 ${
                    clinicalState.triage.priority === 'urgent' ? 'text-red-600' : 'text-amber-600'
                  }`} />
                </div>
                <div>
                  <h4 className={`text-sm font-bold uppercase tracking-wider ${
                    clinicalState.triage.priority === 'urgent' ? 'text-red-700' : 'text-amber-700'
                  }`}>
                    {clinicalState.triage.mandate || 'Alerta de Prioridad Clínica'}
                  </h4>
                  <p className="mt-1 text-sm text-slate-600">
                    {clinicalState.triage.suggestedAction}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {clinicalState.triage.reasons.map((reason, idx) => (
                      <span key={idx} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        clinicalState.triage.priority === 'urgent'
                          ? 'bg-red-100/50 text-red-700'
                          : 'bg-amber-100/50 text-amber-700'
                      }`}>
                        • {reason}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Form Content ── */}
          {!isCompletedView && currentStep && (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${currentPhaseId}-${stepIndex}`}
                className="mx-auto max-w-2xl px-4 py-8 sm:px-6"
                {...fadeSlide}
              >
                {/* Clean Form Container */}
                <section className="space-y-6">
                  {/* Step header indicator */}
                  <div className="flex items-center justify-between px-1">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                      Paso {stepIndex + 1} de {currentPhase.steps.length}
                    </p>
                    <div className="flex gap-1.5">
                      {currentPhase.steps.map((_: unknown, i: number) => {
                        const status = stepStatuses[i]
                        const dotColor =
                          i === stepIndex
                            ? 'bg-sky-500 w-5'
                            : status === 'locked'
                              ? 'bg-emerald-400 w-1.5'
                              : status === 'conflict'
                                ? 'bg-red-400 w-2.5'
                                : status === 'confirm'
                                  ? 'bg-amber-400 w-2'
                                  : i < stepIndex
                                    ? 'bg-sky-300 w-1.5'
                                    : 'bg-slate-200 w-1.5'

                        return (
                          <div
                            key={i}
                            className={`h-1.5 rounded-full transition-all duration-300 ${dotColor}`}
                          />
                        )
                      })}
                    </div>
                  </div>

                  {'field' in currentStep ? (
                    <div className="space-y-5">
                      {/* Conversational header */}
                      <div className="flex flex-col gap-4 rounded-2xl bg-sky-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-600">
                            {formData?.consulta_actual?.tipo_atencion === 'continuidad' ? 'Actualización clínica' : 'Contanos'}
                          </p>
                          <p className="mt-2 text-[15px] font-medium leading-relaxed text-slate-800">
                            {formData?.consulta_actual?.tipo_atencion === 'continuidad' 
                              ? 'Vamos a actualizar tu estado actual antes de la consulta. Esto ayuda a que el médico revise más rápido tu continuidad de tratamiento.' 
                              : currentStep.field.label}
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
                          {voiceMode ? 'Escribir manual' : currentVoiceContext?.knownFacts.length ? 'Continuar con voz' : 'Responder con voz'}
                        </button>
                      </div>

                      {currentVoiceContext && (
                        <div className="rounded-2xl border border-sky-100 bg-sky-50/40 p-4">
                          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-600">
                            Contexto para voz
                          </p>
                          <p className="mt-2 text-sm text-slate-700">
                            La sesión arranca con {currentVoiceContext.knownFacts.length} datos ya conocidos, {currentVoiceContext.missing.length} pendientes y {currentVoiceContext.conflicts.length} puntos a revisar.
                          </p>
                          {currentVoiceContext.doNotAsk.length > 0 && (
                            <p className="mt-2 text-xs text-slate-500">
                              No volver a preguntar: {currentVoiceContext.doNotAsk.slice(0, 4).join(', ')}.
                            </p>
                          )}
                        </div>
                      )}

                      <div className="rounded-2xl border border-slate-100 p-5">
                        {voiceMode ? (() => {
                          // Use clinical state planner for voice guidance
                          const segment = STEP_TO_SEGMENT[currentStep.id]
                          const planned = segment ? getPlannedQuestions(segment) : null
                          const clinicalQuestions = planned?.questions
                            ?.filter(q => q.intent !== 'do_not_ask')
                            ?.map(q => ({
                              id: q.id,
                              text: q.prompt,
                              rationale: q.reason,
                              inputType: 'text' as const,
                              targetSection: currentStep.id,
                              priority: q.intent === 'resolve_conflict' ? 'critical' as const : 'high' as const,
                            })) ?? []

                          // Fallback: if planner has no questions, use the step's field label
                          const questions = clinicalQuestions.length > 0
                            ? clinicalQuestions
                            : [{
                                id: currentStep.id,
                                text: `${currentStep.field.label} (${currentStep.subtitle})`,
                                rationale: 'Psychiatry conversational extraction',
                                inputType: 'text' as const,
                                targetSection: currentStep.id,
                                priority: 'high' as const,
                              }]

                          return (
                          <VoiceAnamnesis
                            guidance={{
                              questions,
                              gaps: planned?.blockedBecauseConflict ?? [],
                              coverageSummary: getPromptSnapshot() || currentPhase.title,
                              alerts: [],
                              coverage: planned?.skippedBecauseKnown ?? [],
                              hasCritical: (planned?.blockedBecauseConflict?.length ?? 0) > 0,
                            }}
                            contextSnapshot={currentVoiceContext}
                            transientData={currentStepData}
                            checkpoint="partial"
                            onDataExtracted={(data) => {
                              const patientLines = data.transcript
                                .filter(e => e.role === 'user')
                                .map(e => e.text)
                                .join(' ')
                                .trim()

                              // Transcript crudo va al ledger via mergeVoiceData — nunca al campo clínico
                              if (segment) {
                                mergeVoiceData(
                                  (data.extractedFields ?? {}) as Record<string, unknown>,
                                  patientLines,
                                  segment,
                                )
                              }

                              // Campo clínico recibe SOLO extracción estructurada o síntesis clínica saneada
                              const hasStructuredExtraction = data.extractedFields
                                && Object.keys(data.extractedFields).length > 0
                              const hasClinicalSummary = data.chiefComplaint
                                && data.chiefComplaint.length >= 10
                                && !/(te( estoy)? escuchando|qué( más)? (preguntas|tengo que contestar|falta)|ya (fue|lo|te) contest(é|ada)|repite|no entiendo|hola|buenas)/i.test(data.chiefComplaint)

                              let clinicalValue: string | null = null
                              if (hasStructuredExtraction && data.chiefComplaint) {
                                clinicalValue = data.chiefComplaint
                              } else if (hasClinicalSummary && data.chiefComplaint) {
                                clinicalValue = data.chiefComplaint
                              }

                              if (clinicalValue) {
                                updateField(currentStep.field.id, clinicalValue)
                              } else {
                                updateField(
                                  currentStep.field.id,
                                  'Sesión de voz completada. La información fue registrada en el historial clínico para revisión del profesional.',
                                )
                              }

                              setVoiceMode(false)
                            }}
                            ledgerContext={{
                              patientId: patient?.id ?? '',
                              caseId: intake?.id ?? '',
                              workflowType: formData?.consulta_actual?.tipo_atencion === 'continuidad' 
                                ? 'psychiatry_continuity' 
                                : 'psychiatry_first_visit',
                              segment: segment
                            }}
                            onSwitchToText={() => setVoiceMode(false)}
                          />)
                        })() : (
                          <ClinicalFieldWrapper
                            canonicalField={getCanonicalField(currentStep.field.id, currentStep.id)}
                            formValue={currentStepData[currentStep.field.id] as AnamnesisFieldValue}
                            label={currentStep.field.label}
                            onConfirm={(value) => {
                              updateField(currentStep.field.id, value)
                              confirmField(currentStep.field.id, currentStep.id)
                            }}
                            onResolve={(value) => {
                              updateField(currentStep.field.id, value)
                              confirmField(currentStep.field.id, currentStep.id)
                            }}
                          >
                            <FieldRenderer
                              field={currentStep.field}
                              value={currentStepData[currentStep.field.id] as AnamnesisFieldValue}
                              onChange={(value) => updateField(currentStep.field.id, value)}
                            />
                          </ClinicalFieldWrapper>
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
                          <ClinicalFieldWrapper
                            canonicalField={currentStep ? getCanonicalField(field.id, currentStep.id) : null}
                            formValue={currentStepData[field.id] as AnamnesisFieldValue}
                            label={field.label}
                            onConfirm={(value) => {
                              updateField(field.id, value)
                              if (currentStep) confirmField(field.id, currentStep.id)
                            }}
                            onResolve={(value) => {
                              updateField(field.id, value)
                              if (currentStep) confirmField(field.id, currentStep.id)
                            }}
                          >
                            <FieldRenderer
                              field={field}
                              value={currentStepData[field.id] as AnamnesisFieldValue}
                              onChange={(value) => updateField(field.id, value)}
                            />
                          </ClinicalFieldWrapper>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Urgency triage banner — driven by clinical state, not form strings */}
                  {clinicalState?.triage?.riskOfInterruption === 'high' && (
                    <motion.div
                      className="mt-5 flex items-start gap-3 rounded-xl border-2 border-red-200 bg-red-50 px-5 py-4"
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100">
                        <ShieldCheck className="h-4 w-4 text-red-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-red-800">
                          Urgencia farmacológica registrada
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-red-700/80">
                          Tu caso será priorizado para prescripción de puente. El equipo médico
                          revisará tu solicitud con la máxima urgencia para evitar interrupciones
                          en el tratamiento.
                        </p>
                      </div>
                    </motion.div>
                  )}
                  {clinicalState?.triage?.riskOfInterruption === 'medium' && (
                    <motion.div
                      className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                        <ShieldCheck className="h-4 w-4 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-amber-800">
                          Atención prioritaria
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-amber-700/80">
                          Con pocos días de medicación, tu consulta será priorizada
                          para garantizar continuidad del tratamiento.
                        </p>
                      </div>
                    </motion.div>
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
                        : 'Continuar'}
                    </button>
                  </div>
                </section>
              </motion.div>
            </AnimatePresence>
          )}

          {/* ── Completed View ── */}
          {isCompletedView && (() => {
            const triagePriority = clinicalState?.triage?.priority ?? 'routine'
            const triageReasons = clinicalState?.triage?.reasons ?? []

            if (triagePriority === 'urgent') {
              return (
                <motion.div className="border-t border-red-100/40 px-6 py-10 sm:px-8" {...fadeSlide}>
                  <div className="mx-auto max-w-3xl overflow-hidden rounded-[28px] border border-red-200 bg-gradient-to-b from-red-50/50 via-white to-white shadow-lg shadow-red-900/[0.03]">
                    <div className="px-8 pt-10 pb-2 text-center">
                      <div className="relative mx-auto h-16 w-16">
                        <div className="absolute inset-0 animate-ping rounded-full bg-red-100/60 [animation-duration:2s]" />
                        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                          <AlertTriangle className="h-8 w-8 text-red-600" />
                        </div>
                      </div>
                      <h2 className="mt-6 font-heading text-2xl font-semibold tracking-tight text-slate-950 uppercase">
                        Evaluación Sincrónica Prioritaria
                      </h2>
                      <div className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-slate-700 bg-red-50/50 p-6 rounded-2xl border border-red-100/50 text-left">
                        <p className="mb-4 font-medium text-red-800">
                          Se han detectado factores de seguridad que requieren evaluación médica sincrónica.
                          Un profesional debe hablar con vos directamente.
                        </p>
                        <ul className="space-y-2 text-slate-600">
                          {triageReasons.map((r, i) => <li key={i} className="flex items-start gap-2">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                            {r}
                          </li>)}
                        </ul>
                      </div>
                    </div>
                    <div className="flex flex-col items-center justify-center gap-3 px-8 pb-10 pt-6 sm:flex-row">
                      <a
                        href="/patients/appointments/new?priority=urgent&source=psychiatry-triage"
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-red-200/40 transition-all hover:bg-red-700 hover:shadow-lg active:scale-[0.97]"
                      >
                        Agendar Evaluación Prioritaria
                      </a>
                      <button
                        type="button"
                        onClick={() => { void handleDownloadPdf() }}
                        disabled={downloadingPdf}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {downloadingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Descargar Evaluación
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            }

            if (triagePriority === 'priority') {
              return (
                <motion.div className="border-t border-amber-100/40 px-6 py-10 sm:px-8" {...fadeSlide}>
                  <div className="mx-auto max-w-3xl overflow-hidden rounded-[28px] border border-amber-200 bg-gradient-to-b from-amber-50/50 via-white to-white shadow-lg shadow-amber-900/[0.03]">
                    <div className="px-8 pt-10 pb-2 text-center">
                      <div className="relative mx-auto h-16 w-16">
                        <div className="absolute inset-0 animate-ping rounded-full bg-amber-100/60 [animation-duration:2s]" />
                        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
                          <ShieldAlert className="h-8 w-8 text-amber-600" />
                        </div>
                      </div>
                      <h2 className="mt-6 font-heading text-2xl font-semibold tracking-tight text-slate-950 uppercase">
                        Revisión Clínica Dirigida
                      </h2>
                      <div className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-slate-700 bg-amber-50/50 p-6 rounded-2xl border border-amber-100/50 text-left">
                        <p className="mb-4 font-medium text-amber-800">
                          Tu caso requiere revisión clínica por parte del equipo médico.
                          Esto no implica necesariamente una consulta sincrónica — el profesional evaluará
                          la mejor vía de resolución y te contactará.
                        </p>
                        <ul className="space-y-2 text-slate-600">
                          {triageReasons.map((r, i) => <li key={i} className="flex items-start gap-2">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                            {r}
                          </li>)}
                        </ul>
                      </div>
                      <p className="mx-auto mt-4 max-w-md text-sm text-slate-500">
                        Tu evaluación ya fue enviada al equipo. Te notificaremos cuando haya una resolución
                        o si se necesita una consulta adicional.
                      </p>
                    </div>
                    <div className="flex flex-col items-center justify-center gap-3 px-8 pb-10 pt-6 sm:flex-row">
                      <a
                        href="/patients/continuity/status"
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-amber-200/40 transition-all hover:bg-amber-600 hover:shadow-lg active:scale-[0.97]"
                      >
                        Ver Estado de mi Caso
                      </a>
                      <button
                        type="button"
                        onClick={() => { void handleDownloadPdf() }}
                        disabled={downloadingPdf}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {downloadingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Descargar PDF
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            }

            return (
              <CompletedGreenView
                downloadingPdf={downloadingPdf}
                saving={saving}
                onDownloadPdf={handleDownloadPdf}
                onRedo={handleRedo}
              />
            );
          })()}

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
