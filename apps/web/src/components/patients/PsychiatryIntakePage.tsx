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

export default function PsychiatryIntakePage() {
  const flow = usePsychiatryIntakeFlow()

  if (flow.authRequired) return null

  if (flow.sessionLoading || flow.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#f8fbff] via-white to-[#f0f9ff]">
        <motion.div className="text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
          <div className="relative mx-auto h-12 w-12">
            <div className="absolute inset-0 animate-ping rounded-full bg-sky-200/60" />
            <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-lg shadow-sky-100">
              <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
            </div>
          </div>
          <p className="mt-5 text-sm font-medium text-slate-500">Preparando tu evaluación...</p>
        </motion.div>
      </div>
    )
  }

  if (flow.intake?.locked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#f8fbff] via-white to-[#f0f9ff] p-6">
        <motion.div className="max-w-md overflow-hidden rounded-3xl border border-sky-100 bg-white/80 p-0 shadow-xl shadow-sky-900/5 backdrop-blur-xl" {...fadeSlide}>
          <div className="bg-gradient-to-r from-sky-50 to-sky-100/50 px-8 pt-8 pb-6">
            <div className="inline-flex items-center justify-center rounded-2xl bg-white p-3 shadow-sm">
              <Lock className="h-6 w-6 text-sky-500" />
            </div>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Evaluación en revisión</h1>
          </div>
          <div className="px-8 pb-8 pt-5">
            <p className="text-sm leading-relaxed text-slate-600">
              Tu evaluación fue enviada al equipo de psiquiatría y está siendo revisada. Mientras tanto, no se permiten modificaciones.
            </p>
            <a href="/patients/dashboard" className="mt-6 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:shadow-md active:scale-[0.98]">
              <ArrowLeft className="h-4 w-4" />
              Volver al inicio
            </a>
          </div>
        </motion.div>
      </div>
    )
  }

  const isContinuity = flow.formData?.consulta_actual?.tipo_atencion === 'continuidad'

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#f8fbff_0%,#ffffff_50%,#f0f9ff_100%)]">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <motion.div
          className="overflow-hidden rounded-[28px] border border-sky-100/60 bg-white/80 shadow-xl shadow-sky-900/[0.04] backdrop-blur-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Header */}
          <div className="relative overflow-hidden border-b border-sky-100/40 px-6 py-8 sm:px-8">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gradient-to-br from-sky-100/40 to-transparent blur-3xl" />
            <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-gradient-to-tr from-sky-50/60 to-transparent blur-2xl" />
            <div className="flex w-full flex-col sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-sky-50/80 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-sky-700 backdrop-blur-sm">
                  <Stethoscope className="h-3.5 w-3.5" />
                  {isContinuity ? 'Renovación de Tratamiento' : 'Evaluación Psiquiátrica'}
                </div>
                <h1 className="mt-4 font-heading text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                  {isContinuity ? 'Continuidad de tratamiento' : 'Completá tu evaluación'}
                </h1>
              </div>
              <div className="mt-4 sm:mt-0">
                <div className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-2 shadow-sm">
                  <Timer className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-600">
                    {Math.max(1, flow.currentPhase.steps.length - flow.stepIndex)} pasos restantes
                  </span>
                </div>
              </div>
            </div>
          </div>

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
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40">
                      <ArrowLeft className="h-4 w-4" />
                      Anterior
                    </button>
                    <button type="button" onClick={() => { void flow.handleNext() }} disabled={flow.saving}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-sky-200/40 transition-all hover:bg-sky-600 hover:shadow-lg hover:shadow-sky-200/50 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60">
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
            onConfirm={(value) => { flow.updateField(currentStep.field.id, value); flow.confirmField(currentStep.field.id, currentStep.id) }}
            onResolve={(value) => { flow.updateField(currentStep.field.id, value); flow.confirmField(currentStep.field.id, currentStep.id) }}
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

        const hasStructuredExtraction = data.extractedFields && Object.keys(data.extractedFields).length > 0
        const hasClinicalSummary = data.chiefComplaint && data.chiefComplaint.length >= 10
          && !/(te( estoy)? escuchando|qué( más)? (preguntas|tengo que contestar|falta)|ya (fue|lo|te) contest(é|ada)|repite|no entiendo|hola|buenas)/i.test(data.chiefComplaint)

        let clinicalValue: string | null = null
        if (hasStructuredExtraction && data.chiefComplaint) clinicalValue = data.chiefComplaint
        else if (hasClinicalSummary && data.chiefComplaint) clinicalValue = data.chiefComplaint

        flow.updateField(currentStep.field.id, clinicalValue ?? 'Sesión de voz completada. La información fue registrada en el historial clínico para revisión del profesional.')
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
            onConfirm={(value) => { flow.updateField(field.id, value); flow.confirmField(field.id, currentStep.id) }}
            onResolve={(value) => { flow.updateField(field.id, value); flow.confirmField(field.id, currentStep.id) }}
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
