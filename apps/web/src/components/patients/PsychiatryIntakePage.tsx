'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Timer,
} from 'lucide-react'
import { psychiatryPhaseOrder } from '@/lib/patients/data/psychiatry-intake-steps'
import { STEP_TO_SEGMENT } from '@/lib/patients/usecases/psychiatry-intake-flow.usecase'
import { usePsychiatryIntakeFlow } from '@/hooks/patients/usePsychiatryIntakeFlow'
import { AnamnesisField as FieldRenderer } from '@/components/patients/anamnesis/AnamnesisField'
import { VoiceAnamnesis } from '@/components/patients/anamnesis/VoiceAnamnesis'
import { ClinicalFieldWrapper } from '@/components/patients/intake/ClinicalFieldWrapper'
import { PsychiatryCompletedView } from '@/components/patients/intake/PsychiatryCompletedView'
import type { AnamnesisField, AnamnesisFieldValue } from '@/lib/patients/types/anamnesis'
import type { SegmentKey } from '@/lib/patients/clinical-state/types'

const fadeSlide = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
}

const META_VOICE_PATTERN = /(te( estoy)? escuchando|que( mas)? (preguntas|tengo que contestar|falta)|ya (fue|lo|te) contest(e|ada)|repite|no entiendo|hola|buenas)/i

function normalizeVoiceClinicalText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text.length < 8) return null
  if (META_VOICE_PATTERN.test(text)) return null
  return text
}

function resolveVoiceStepValue(params: {
  fieldId: string
  extractedFields?: Record<string, unknown>
  patientLines: string
  chiefComplaint?: string | null
  currentValue?: unknown
}): string | null {
  const fromFieldExtraction = normalizeVoiceClinicalText(params.extractedFields?.[params.fieldId])
  if (fromFieldExtraction) return fromFieldExtraction

  const fromPatientTranscript = normalizeVoiceClinicalText(params.patientLines)
  if (fromPatientTranscript) return fromPatientTranscript

  const fromSummary = normalizeVoiceClinicalText(params.chiefComplaint)
  if (fromSummary) return fromSummary

  return normalizeVoiceClinicalText(params.currentValue)
}

export default function PsychiatryIntakePage() {
  const flow = usePsychiatryIntakeFlow()

  if (flow.authRequired) return null

  if (flow.sessionLoading || flow.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <motion.div className="text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <motion.div
            className="mx-auto size-16 rounded-full bg-neutral-900 flex items-center justify-center mb-6"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <Stethoscope className="size-8 text-white" />
          </motion.div>
          <p className="text-neutral-500">Preparando tu evaluación...</p>
        </motion.div>
      </div>
    )
  }

  if (flow.intake?.locked) {
    return (
      <div className="min-h-screen bg-white">
        <section className="bg-neutral-900 px-6 lg:px-12 pt-16 pb-20">
          <div className="max-w-7xl mx-auto">
            <motion.div
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 text-white/80 rounded-full text-xs font-medium mb-6"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <Lock className="size-3.5" />
              En revisión
            </motion.div>
            <motion.h1
              className="text-4xl lg:text-5xl text-white mb-4 leading-tight"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              Evaluación en revisión
            </motion.h1>
            <motion.p
              className="text-lg text-white/60 max-w-lg"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              Tu evaluación fue enviada al equipo de psiquiatría y está siendo revisada.
            </motion.p>
          </div>
        </section>
        <div className="max-w-3xl mx-auto px-6 lg:px-12 -mt-8 pb-24">
          <motion.div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-lg" {...fadeSlide}>
            <p className="text-neutral-600 mb-6">Mientras tanto, no se permiten modificaciones.</p>
            <a href="/patients/dashboard" className="inline-flex items-center gap-2 px-6 py-3 border border-neutral-200 text-neutral-700 rounded-full font-medium hover:border-neutral-900 transition-all">
              <ArrowLeft className="size-4" /> Volver al inicio
            </a>
          </motion.div>
        </div>
      </div>
    )
  }

  const isContinuity = flow.formData?.consulta_actual?.tipo_atencion === 'continuidad'

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Header */}
      <section className="bg-neutral-900 px-6 lg:px-12 pt-16 pb-20">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
          <div>
            <motion.div
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 text-white/80 rounded-full text-xs font-medium mb-6"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <Stethoscope className="size-3.5" />
              {isContinuity ? 'Renovación de Tratamiento' : 'Evaluación Psiquiátrica'}
            </motion.div>
            <motion.h1
              className="text-4xl lg:text-5xl text-white mb-4 leading-tight"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              {isContinuity ? 'Continuidad de tratamiento' : 'Completá tu evaluación'}
            </motion.h1>
          </div>
          <motion.div
            className="shrink-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur px-4 py-2 text-sm text-white/80">
              <Timer className="size-4" />
              {Math.max(1, flow.currentPhase.steps.length - flow.stepIndex)} pasos restantes
            </div>
          </motion.div>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-6 lg:px-12 -mt-8 pb-24">
        <motion.div
          className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-lg"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >

          {/* Clinical Triage Alert */}
          {flow.clinicalState?.triage && (flow.clinicalState.triage.priority === 'urgent' || flow.clinicalState.triage.priority === 'priority') && (
            <TriageAlert triage={flow.clinicalState.triage} />
          )}

          {/* Wizard Form */}
          {!flow.isCompletedView && flow.currentStep && (
            <AnimatePresence mode="wait">
              <motion.div key={`${flow.currentPhaseId}-${flow.stepIndex}`} className="mx-auto max-w-2xl px-4 py-8 sm:px-6" {...fadeSlide}>
                <section className="space-y-6">
                  <StepProgressBar stepIndex={flow.stepIndex} steps={flow.currentPhase.steps} stepStatuses={flow.stepStatuses} />

                  {'field' in (flow.currentStep as object) ? (
                    <SingleFieldStep flow={flow} isContinuity={isContinuity} />
                  ) : (
                    <MultiFieldStep flow={flow} />
                  )}

                  <UrgencyBanner riskOfInterruption={flow.clinicalState?.triage?.riskOfInterruption} />

                  {flow.saveError && (
                    <motion.div className="mt-5 rounded-xl border border-red-100 bg-red-50/80 px-4 py-3 text-sm font-medium text-red-600" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                      {flow.saveError}
                    </motion.div>
                  )}

                  <div className="mt-8 flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <button type="button" onClick={flow.handlePrev} disabled={flow.phaseIndex === 0 && flow.stepIndex === 0}
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-neutral-200 text-neutral-700 rounded-full font-medium hover:border-neutral-900 transition-all disabled:cursor-not-allowed disabled:opacity-40">
                      <ArrowLeft className="h-4 w-4" />
                      Anterior
                    </button>
                    <button type="button" onClick={() => { void flow.handleNext() }} disabled={flow.saving}
                      className="inline-flex items-center justify-center gap-2 px-8 py-3 bg-neutral-900 text-white rounded-full font-medium hover:bg-neutral-800 transition-all disabled:cursor-not-allowed disabled:opacity-60">
                      {flow.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                      {flow.phaseIndex === psychiatryPhaseOrder.length - 2 && flow.stepIndex === flow.currentPhase.steps.length - 1
                        ? 'Finalizar evaluación'
                        : 'Continuar'}
                    </button>
                  </div>
                </section>
              </motion.div>
            </AnimatePresence>
          )}

          {/* Completed View */}
          {flow.isCompletedView && (
            <PsychiatryCompletedView
              triagePriority={flow.clinicalState?.triage?.priority ?? 'routine'}
              triageReasons={flow.clinicalState?.triage?.reasons ?? []}
              downloadingPdf={flow.downloadingPdf}
              saving={flow.saving}
              onDownloadPdf={() => { void flow.handleDownloadPdf() }}
              onRedo={() => { void flow.handleRedo() }}
            />
          )}

          {/* Error */}
          {flow.error && flow.error !== 'unauthorized' && (
            <div className="border-t border-red-100 bg-red-50/80 px-6 py-4 text-sm font-medium text-red-600 sm:px-8">
              {flow.error}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}

/* ── Presentational sub-components (same file, no logic) ── */

function TriageAlert({ triage }: { triage: { priority: string; mandate?: string; suggestedAction?: string; reasons: string[] } }) {
  const isUrgent = triage.priority === 'urgent'
  return (
    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
      className={`border-b px-6 py-4 sm:px-8 ${isUrgent ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 rounded-full p-1.5 ${isUrgent ? 'bg-red-100' : 'bg-amber-100'}`}>
          <Sparkles className={`h-4 w-4 ${isUrgent ? 'text-red-600' : 'text-amber-600'}`} />
        </div>
        <div>
          <h4 className={`text-sm font-bold uppercase tracking-wider ${isUrgent ? 'text-red-700' : 'text-amber-700'}`}>
            {triage.mandate || 'Alerta de Prioridad Clínica'}
          </h4>
          <p className="mt-1 text-sm text-slate-600">{triage.suggestedAction}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {triage.reasons.map((reason, idx) => (
              <span key={idx} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isUrgent ? 'bg-red-100/50 text-red-700' : 'bg-amber-100/50 text-amber-700'}`}>
                {reason}
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function StepProgressBar({ stepIndex, steps, stepStatuses }: { stepIndex: number; steps: readonly unknown[]; stepStatuses: string[] }) {
  return (
    <div className="flex items-center justify-between px-1">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Paso {stepIndex + 1} de {steps.length}</p>
      <div className="flex gap-1.5">
        {steps.map((_: unknown, i: number) => {
          const status = stepStatuses[i]
          const dotColor = i === stepIndex ? 'bg-sky-500 w-5'
            : status === 'locked' ? 'bg-emerald-400 w-1.5'
            : status === 'conflict' ? 'bg-red-400 w-2.5'
            : status === 'confirm' ? 'bg-amber-400 w-2'
            : i < stepIndex ? 'bg-sky-300 w-1.5'
            : 'bg-slate-200 w-1.5'
          return <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${dotColor}`} />
        })}
      </div>
    </div>
  )
}

function SingleFieldStep({ flow, isContinuity }: { flow: ReturnType<typeof usePsychiatryIntakeFlow>; isContinuity: boolean }) {
  const currentStep = flow.currentStep as { id: string; field: AnamnesisField; subtitle: string }
  const segment = STEP_TO_SEGMENT[currentStep.id] as SegmentKey | undefined

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl bg-sky-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-600">
            {isContinuity ? 'Actualización clínica' : 'Contanos'}
          </p>
          <p className="mt-2 text-[15px] font-medium leading-relaxed text-slate-800">
            {isContinuity
              ? 'Vamos a actualizar tu estado actual antes de la consulta. Esto ayuda a que el médico revise más rápido tu continuidad de tratamiento.'
              : currentStep.field.label}
          </p>
        </div>
        <button type="button" onClick={() => flow.setVoiceMode(!flow.voiceMode)}
          className={`inline-flex min-w-[160px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.97] ${
            flow.voiceMode ? 'border border-sky-200 bg-white text-sky-600 shadow-sm hover:bg-sky-50' : 'bg-sky-500 text-white shadow-md shadow-sky-200/50 hover:bg-sky-600'
          }`}>
          {flow.voiceMode ? 'Escribir manual' : flow.currentVoiceContext?.knownFacts.length ? 'Continuar con voz' : 'Responder con voz'}
        </button>
      </div>

      {flow.currentVoiceContext && (
        <div className="rounded-2xl border border-sky-100 bg-sky-50/40 p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-600">Contexto para voz</p>
          <p className="mt-2 text-sm text-slate-700">
            La sesión arranca con {flow.currentVoiceContext.knownFacts.length} datos ya conocidos, {flow.currentVoiceContext.missing.length} pendientes y {flow.currentVoiceContext.conflicts.length} puntos a revisar.
          </p>
          {flow.currentVoiceContext.doNotAsk.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">No volver a preguntar: {flow.currentVoiceContext.doNotAsk.slice(0, 4).join(', ')}.</p>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-slate-100 p-5">
        {flow.voiceMode ? (
          <VoiceStepContent flow={flow} currentStep={currentStep} segment={segment} />
        ) : (
          <ClinicalFieldWrapper
            canonicalField={flow.getCanonicalField(currentStep.field.id, currentStep.id)}
            formValue={flow.currentStepData[currentStep.field.id] as AnamnesisFieldValue}
            label={currentStep.field.label}
            onConfirm={(value) => { flow.updateField(currentStep.field.id, value); flow.confirmField(currentStep.field.id, currentStep.id, value) }}
            onResolve={(value) => { flow.updateField(currentStep.field.id, value); flow.confirmField(currentStep.field.id, currentStep.id, value) }}
          >
            <FieldRenderer field={currentStep.field} value={flow.currentStepData[currentStep.field.id] as AnamnesisFieldValue} onChange={(value) => flow.updateField(currentStep.field.id, value)} />
          </ClinicalFieldWrapper>
        )}
      </div>
    </div>
  )
}

function VoiceStepContent({ flow, currentStep, segment }: {
  flow: ReturnType<typeof usePsychiatryIntakeFlow>
  currentStep: { id: string; field: AnamnesisField; subtitle: string }
  segment: SegmentKey | undefined
}) {
  const planned = segment ? flow.getPlannedQuestions(segment) : null
  const clinicalQuestions = planned?.questions
    ?.filter(q => q.intent !== 'do_not_ask')
    ?.map(q => ({ id: q.id, text: q.prompt, rationale: q.reason, inputType: 'text' as const, targetSection: currentStep.id, priority: q.intent === 'resolve_conflict' ? 'critical' as const : 'high' as const })) ?? []

  const questions = clinicalQuestions.length > 0
    ? clinicalQuestions
    : [{ id: currentStep.id, text: `${currentStep.field.label} (${currentStep.subtitle})`, rationale: 'Psychiatry conversational extraction', inputType: 'text' as const, targetSection: currentStep.id, priority: 'high' as const }]

  return (
    <VoiceAnamnesis
      guidance={{ questions, gaps: planned?.blockedBecauseConflict ?? [], coverageSummary: flow.getPromptSnapshot() || '', alerts: [], coverage: planned?.skippedBecauseKnown ?? [], hasCritical: (planned?.blockedBecauseConflict?.length ?? 0) > 0 }}
      contextSnapshot={flow.currentVoiceContext}
      transientData={flow.currentStepData}
      checkpoint="partial"
      onDataExtracted={(data) => {
        const patientLines = data.transcript.filter(e => e.role === 'user').map(e => e.text).join(' ').trim()

        if (segment) {
          flow.mergeVoiceData((data.extractedFields ?? {}) as Record<string, unknown>, patientLines, segment)
        }

        const resolvedValue = resolveVoiceStepValue({
          fieldId: currentStep.field.id,
          extractedFields: data.extractedFields,
          patientLines,
          chiefComplaint: data.chiefComplaint,
          currentValue: flow.currentStepData[currentStep.field.id],
        })

        if (resolvedValue) {
          flow.updateField(currentStep.field.id, resolvedValue)
        }
        flow.setVoiceMode(false)
      }}
      ledgerContext={{ patientId: flow.patient?.id ?? '', caseId: flow.intake?.id ?? '', workflowType: flow.formData?.consulta_actual?.tipo_atencion === 'continuidad' ? 'psychiatry_continuity' : 'psychiatry_first_visit', segment }}
      onSwitchToText={() => flow.setVoiceMode(false)}
    />
  )
}

function MultiFieldStep({ flow }: { flow: ReturnType<typeof usePsychiatryIntakeFlow> }) {
  const currentStep = flow.currentStep as { id: string }
  return (
    <div className="space-y-5">
      {flow.visibleFields.map((field) => (
        <div key={field.id} className="rounded-2xl border border-slate-100 p-5 transition-all hover:border-sky-100 hover:shadow-sm">
          <div className="mb-3.5">
            <p className="text-sm font-semibold text-slate-800">{field.label}</p>
            {field.tooltip && <p className="mt-1 text-xs text-slate-400">{field.tooltip}</p>}
          </div>
          <ClinicalFieldWrapper
            canonicalField={flow.getCanonicalField(field.id, currentStep.id)}
            formValue={flow.currentStepData[field.id] as AnamnesisFieldValue}
            label={field.label}
            onConfirm={(value) => { flow.updateField(field.id, value); flow.confirmField(field.id, currentStep.id, value) }}
            onResolve={(value) => { flow.updateField(field.id, value); flow.confirmField(field.id, currentStep.id, value) }}
          >
            <FieldRenderer field={field} value={flow.currentStepData[field.id] as AnamnesisFieldValue} onChange={(value) => flow.updateField(field.id, value)} />
          </ClinicalFieldWrapper>
        </div>
      ))}
    </div>
  )
}

function UrgencyBanner({ riskOfInterruption }: { riskOfInterruption?: string | null }) {
  if (riskOfInterruption === 'high') {
    return (
      <motion.div className="mt-5 flex items-start gap-3 rounded-xl border-2 border-red-200 bg-red-50 px-5 py-4" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100">
          <ShieldCheck className="h-4 w-4 text-red-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-red-800">Urgencia farmacológica registrada</p>
          <p className="mt-1 text-xs leading-relaxed text-red-700/80">
            Tu caso será priorizado para prescripción de puente. El equipo médico revisará tu solicitud con la máxima urgencia para evitar interrupciones en el tratamiento.
          </p>
        </div>
      </motion.div>
    )
  }
  if (riskOfInterruption === 'medium') {
    return (
      <motion.div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100">
          <ShieldCheck className="h-4 w-4 text-amber-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-amber-800">Atención prioritaria</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-700/80">
            Con pocos días de medicación, tu consulta será priorizada para garantizar continuidad del tratamiento.
          </p>
        </div>
      </motion.div>
    )
  }
  return null
}
