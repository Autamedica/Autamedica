'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Loader2, MessageCircle } from 'lucide-react'
import { useConversationalAnamnesis } from '@/hooks/patients/useConversationalAnamnesis'
import { useAnamnesis } from '@/hooks/patients/useAnamnesis'
import { useAnamnesisGuidance } from '@/hooks/patients/useAnamnesisGuidance'
import { ConversationalField } from './ConversationalField'
import { ClarificationStep } from './ClarificationStep'
import { AnalysisResultOverlay } from './AnalysisResultOverlay'
import type { AnamnesisFieldValue } from '@/lib/patients/types/anamnesis'
import type { AnamnesisSection } from '@autamedica/types'
import type { GuidanceQuestion } from '@/lib/patients/services/anamnesis-guidance.service'

interface ConversationalAnamnesisProps {
  initialData?: Record<string, Record<string, AnamnesisFieldValue>>
  onComplete: () => void
  onSwitchMode: () => void
}

/** Save batch size — persist to DB every N answers */
const SAVE_EVERY = 5

/**
 * Conversational anamnesis: one question at a time.
 * Same data model as wizard, different UX.
 * Senior-friendly: large text, minimal chrome, voice input.
 */
export function ConversationalAnamnesis({
  initialData,
  onComplete,
  onSwitchMode,
}: ConversationalAnamnesisProps) {
  const {
    current,
    currentIndex,
    totalVisible,
    progressPct,
    history,
    answer: answerQuestion,
    goBack,
    isFirst,
    isLast,
    getAnswer,
    getFormData,
    shouldCheckpoint,
    completedStepIds,
  } = useConversationalAnamnesis(initialData)

  const { updateSection, updateAnamnesis } = useAnamnesis()
  const {
    guidance,
    triggerExtraction,
    addClarification,
    dismissGuidance,
  } = useAnamnesisGuidance()

  const [saving, setSaving] = useState(false)
  const [showClarification, setShowClarification] = useState(false)
  const [showAnalyzing, setShowAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<{
    coverage: string[]
    gaps: string[]
    questions: GuidanceQuestion[]
  } | null>(null)
  const [pendingCheckpoint, setPendingCheckpoint] = useState<'partial' | 'final' | null>(null)

  const answerCountRef = useRef(0)
  const _lastSavedStepRef = useRef<string | null>(null)
  const questionRef = useRef<HTMLDivElement>(null)

  // Scroll to question on change
  useEffect(() => {
    questionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [currentIndex])

  // Batch save to DB
  const persistCurrentState = useCallback(async () => {
    const formData = getFormData()
    setSaving(true)
    try {
      for (const [stepId, data] of Object.entries(formData)) {
        if (completedStepIds.has(stepId) || Object.keys(data).length > 0) {
          await updateSection(
            stepId as AnamnesisSection,
            data,
          )
        }
      }
    } finally {
      setSaving(false)
    }
  }, [getFormData, completedStepIds, updateSection])

  const handleAnswer = useCallback(async (value: AnamnesisFieldValue) => {
    answerQuestion(value)
    answerCountRef.current++

    // Batch save every N answers
    if (answerCountRef.current % SAVE_EVERY === 0) {
      await persistCurrentState()
    }

    // Check for checkpoints
    const checkpoint = shouldCheckpoint()
    if (checkpoint === 'partial') {
      setPendingCheckpoint('partial')
      setShowAnalyzing(true)
      setAnalysisResult(null)
      await persistCurrentState()
      const result = await triggerExtraction('partial')
      setAnalysisResult({
        coverage: result?.coverage ?? [],
        gaps: result?.gaps ?? [],
        questions: result?.questions ?? [],
      })
    } else if (checkpoint === 'final' || isLast) {
      await persistCurrentState()
      setPendingCheckpoint('final')
      const result = await triggerExtraction('final')
      if (result?.hasCritical) {
        setShowClarification(true)
        return
      }
      await updateAnamnesis({ status: 'completed' } as Record<string, unknown>)
      onComplete()
    }
  }, [answerQuestion, shouldCheckpoint, isLast, persistCurrentState, triggerExtraction, updateAnamnesis, onComplete])

  const handleAnalysisContinue = useCallback(() => {
    setShowAnalyzing(false)
    setAnalysisResult(null)
    const hasQuestions = guidance?.questions && guidance.questions.length > 0
    if (hasQuestions) {
      setShowClarification(true)
      return
    }
    setPendingCheckpoint(null)
    dismissGuidance()
  }, [guidance, dismissGuidance])

  const handleClarificationSubmit = useCallback(async (
    answers: { question: string; answer: string }[],
  ) => {
    for (const a of answers) {
      addClarification(a.question, a.answer)
    }
    setShowClarification(false)
    if (pendingCheckpoint === 'final') {
      await updateAnamnesis({ status: 'completed' } as Record<string, unknown>)
      onComplete()
    }
    setPendingCheckpoint(null)
    dismissGuidance()
  }, [addClarification, pendingCheckpoint, updateAnamnesis, dismissGuidance, onComplete])

  const handleClarificationSkip = useCallback(async () => {
    const hasCritical = guidance?.questions?.some(q => q.priority === 'critical')
    if (hasCritical) return // Can't skip critical

    setShowClarification(false)
    if (pendingCheckpoint === 'final') {
      await updateAnamnesis({ status: 'completed' } as Record<string, unknown>)
      onComplete()
    }
    setPendingCheckpoint(null)
    dismissGuidance()
  }, [guidance, pendingCheckpoint, updateAnamnesis, dismissGuidance, onComplete])

  if (!current) return null

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Minimal header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <button
            onClick={onSwitchMode}
            className="text-xs font-medium text-stone-400 hover:text-stone-600"
          >
            Ver formulario
          </button>
          <div className="flex items-center gap-2">
            {saving && <Loader2 className="h-3 w-3 animate-spin text-emerald-500" />}
            <span className="text-xs font-medium text-stone-400">
              {currentIndex + 1}/{totalVisible}
            </span>
          </div>
        </div>
        {/* Circular progress */}
        <div className="mx-auto max-w-lg px-4 pb-2">
          <div className="h-1 rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-700 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </header>

      {/* Chat history (scrollable, faded) */}
      <div className="mx-auto w-full max-w-lg flex-1 px-4">
        {history.length > 0 && (
          <div className="mb-6 space-y-3">
            {history.slice(-3).map(q => {
              const val = getAnswer(q.key)
              return (
                <div key={q.key} className="flex items-start gap-3 opacity-40">
                  <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-stone-500">{q.field.label}</p>
                    <p className="text-sm font-medium text-stone-700 truncate">
                      {formatAnswer(val)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Current question */}
        <div ref={questionRef} className="py-4">
          <div className="mb-2 flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-emerald-600" />
            <span className="text-xs font-medium text-emerald-600 uppercase tracking-wide">
              AutaMedica
            </span>
          </div>

          <h2 className="mb-6 text-xl font-bold leading-snug text-stone-900 sm:text-2xl">
            {current.field.label}
          </h2>

          {current.field.tooltip && (
            <p className="mb-4 text-sm text-stone-400">
              {current.field.tooltip}
            </p>
          )}

          <ConversationalField
            key={current.key}
            field={current.field}
            value={getAnswer(current.key)}
            onSubmit={handleAnswer}
          />
        </div>
      </div>

      {/* Back button — always visible */}
      {!isFirst && (
        <footer className="sticky bottom-0 bg-white/90 backdrop-blur-sm">
          <div className="mx-auto max-w-lg px-4 py-3">
            <button
              onClick={goBack}
              className="flex items-center gap-1.5 text-sm font-medium text-stone-400 hover:text-stone-600"
            >
              <ArrowLeft className="h-4 w-4" />
              Anterior
            </button>
          </div>
        </footer>
      )}

      {/* Overlays */}
      {showAnalyzing && (
        <AnalysisResultOverlay
          analysisResult={analysisResult}
          onContinue={handleAnalysisContinue}
        />
      )}

      {showClarification && guidance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/95 backdrop-blur-sm">
          <div className="w-full max-w-2xl">
            <ClarificationStep
              guidance={guidance}
              isPartial={pendingCheckpoint === 'partial'}
              onSubmit={handleClarificationSubmit}
              onSkip={handleClarificationSkip}
              isSubmitting={saving}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// --- Helpers ---

function formatAnswer(val: AnamnesisFieldValue): string {
  if (val == null) return '-'
  if (typeof val === 'boolean') return val ? 'Sí' : 'No'
  if (typeof val === 'number') return String(val)
  if (Array.isArray(val)) return val.length > 0 ? val.join(', ') : 'Ninguno'
  return String(val)
}
