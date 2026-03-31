'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Loader2, MessageCircle, Sparkles, Send, Mic } from 'lucide-react'
import { useConversationalAnamnesis } from '@/hooks/patients/useConversationalAnamnesis'
import { useAnamnesis } from '@/hooks/patients/useAnamnesis'
import { useAnamnesisGuidance } from '@/hooks/patients/useAnamnesisGuidance'
import { useAiFirstQuestion, type AiQuestion } from '@/hooks/patients/useAiFirstQuestion'
import { VoiceAnamnesis } from './VoiceAnamnesis'
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

const SAVE_EVERY = 5

type Phase = 'chief_complaint' | 'ai_questions' | 'structured'

/**
 * AI-first conversational anamnesis.
 *
 * Phase 1: "¿Qué te trae hoy?" — free text → sent to Gemini
 * Phase 2: AI-generated follow-up questions (4-8 targeted)
 * Phase 3: Remaining structured questions from anamnesisSteps
 */
export function ConversationalAnamnesis({
  initialData,
  onComplete,
  onSwitchMode,
}: ConversationalAnamnesisProps) {
  // Always start with AI phase — returning patients benefit from AI analyzing
  // their current complaint, even if they have prior data.
  const [phase, setPhase] = useState<Phase>('chief_complaint')
  const [chiefComplaint, setChiefComplaint] = useState('')
  const [aiQuestionIndex, setAiQuestionIndex] = useState(0)
  const [_aiAnswers, setAiAnswers] = useState<Record<string, string>>({})
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text')

  const {
    current,
    currentIndex,
    totalVisible,
    progressPct: _progressPct,
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

  const {
    askAi,
    aiQuestions,
    urgencyLevel,
    loading: aiLoading,
    error: aiError,
  } = useAiFirstQuestion()

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
  const hasDirtyAnswers = useRef(false)
  const questionRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Protect unsaved answers on tab close / navigation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasDirtyAnswers.current) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  useEffect(() => {
    questionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [currentIndex, phase, aiQuestionIndex])

  // Focus textarea on mount
  useEffect(() => {
    if (phase === 'chief_complaint') {
      setTimeout(() => textareaRef.current?.focus(), 300)
    }
  }, [phase])

  // --- Phase 1 (voice): Handle data from voice conversation ---
  const handleVoiceDataExtracted = useCallback(async (data: {
    chiefComplaint: string
    transcript: { role: string; text: string; timestamp: number }[]
    detectedSections: string[]
  }) => {
    // Save chief complaint
    if (data.chiefComplaint) {
      await updateSection('motivo_consulta' as AnamnesisSection, {
        motivo_principal: data.chiefComplaint,
      })
    }

    // Save transcript as additional context
    const transcriptText = data.transcript
      .map(t => `${t.role === 'user' ? 'Paciente' : 'AutaMedica'}: ${t.text}`)
      .join('\n')

    if (transcriptText) {
      await updateSection('motivo_consulta' as AnamnesisSection, {
        motivo_principal: data.chiefComplaint,
        contexto_conversacion_ia: transcriptText,
      })
    }

    // Skip AI questions phase — voice already covered them
    // Go directly to structured questions, skipping detected sections
    setPhase('structured')
  }, [updateSection])

  // --- Phase 1 (text): Submit chief complaint to AI ---
  const handleChiefComplaintSubmit = useCallback(async () => {
    if (!chiefComplaint.trim() || chiefComplaint.length < 5) return

    // Save chief complaint to motivo_consulta section
    await updateSection('motivo_consulta' as AnamnesisSection, {
      motivo_principal: chiefComplaint.trim(),
    })

    // Ask AI for follow-up questions
    const result = await askAi(chiefComplaint.trim())

    if (result && result.questions.length > 0) {
      setPhase('ai_questions')
      setAiQuestionIndex(0)
    } else {
      // AI unavailable — fall through to structured
      setPhase('structured')
    }
  }, [chiefComplaint, askAi, updateSection])

  // --- Phase 2: Answer AI question ---
  const handleAiAnswer = useCallback(async (answer: string) => {
    const q = aiQuestions[aiQuestionIndex]
    if (!q) return

    setAiAnswers(prev => ({ ...prev, [q.id]: answer }))

    // Save AI answers into the target section
    if (q.targetSection) {
      await updateSection(q.targetSection as AnamnesisSection, {
        [`ai_${q.id}`]: answer,
      }).catch(() => {/* best effort */})
    }

    if (aiQuestionIndex < aiQuestions.length - 1) {
      setAiQuestionIndex(prev => prev + 1)
    } else {
      // Done with AI questions — move to structured
      setPhase('structured')
    }
  }, [aiQuestions, aiQuestionIndex, updateSection])

  // --- Phase 3: Structured questions (existing logic) ---
  const persistCurrentState = useCallback(async () => {
    const formData = getFormData()
    setSaving(true)
    try {
      for (const [stepId, data] of Object.entries(formData)) {
        if (completedStepIds.has(stepId) || Object.keys(data).length > 0) {
          await updateSection(stepId as AnamnesisSection, data)
        }
      }
    } finally {
      setSaving(false)
    }
  }, [getFormData, completedStepIds, updateSection])

  const handleStructuredAnswer = useCallback(async (value: AnamnesisFieldValue) => {
    answerQuestion(value)
    answerCountRef.current++
    hasDirtyAnswers.current = true

    if (answerCountRef.current % SAVE_EVERY === 0) {
      await persistCurrentState()
      hasDirtyAnswers.current = false
    }

    const checkpoint = shouldCheckpoint()
    if (checkpoint === 'partial') {
      setPendingCheckpoint('partial')
      setShowAnalyzing(true)
      setAnalysisResult(null)
      await persistCurrentState()
      hasDirtyAnswers.current = false
      const result = await triggerExtraction('partial')
      setAnalysisResult({
        coverage: result?.coverage ?? [],
        gaps: result?.gaps ?? [],
        questions: result?.questions ?? [],
      })
    } else if (checkpoint === 'final' || isLast) {
      await persistCurrentState()
      hasDirtyAnswers.current = false
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
    if (guidance?.questions && guidance.questions.length > 0) {
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
    if (hasCritical) return
    setShowClarification(false)
    if (pendingCheckpoint === 'final') {
      await updateAnamnesis({ status: 'completed' } as Record<string, unknown>)
      onComplete()
    }
    setPendingCheckpoint(null)
    dismissGuidance()
  }, [guidance, pendingCheckpoint, updateAnamnesis, dismissGuidance, onComplete])

  // --- Compute progress across all phases ---
  const totalPhases = 1 + aiQuestions.length + totalVisible
  const completedPhases =
    phase === 'chief_complaint' ? 0
    : phase === 'ai_questions' ? 1 + aiQuestionIndex
    : 1 + aiQuestions.length + currentIndex
  const overallProgress = totalPhases > 0 ? Math.round((completedPhases / totalPhases) * 100) : 0

  // --- Render ---
  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <button
            onClick={onSwitchMode}
            className="text-xs font-medium text-stone-400 hover:text-stone-600"
          >
            Ver formulario
          </button>
          <div className="flex items-center gap-2">
            {(saving || aiLoading) && <Loader2 className="h-3 w-3 animate-spin text-sky-500" />}
            <span className="text-xs font-medium text-stone-400">
              {completedPhases + 1}/{totalPhases}
            </span>
          </div>
        </div>
        <div className="mx-auto max-w-lg px-4 pb-2">
          <div className="h-1 rounded-full bg-stone-100">
            <div
              className="h-full rounded-full bg-sky-500 transition-all duration-700 ease-out"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-lg flex-1 px-4">
        {/* ====== PHASE 1: Chief Complaint (Voice or Text) ====== */}
        {phase === 'chief_complaint' && (
          <div ref={questionRef} className="py-8">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-sky-600" />
              <span className="text-xs font-medium text-sky-600 uppercase tracking-wide">
                AutaMedica IA
              </span>
            </div>

            <h2 className="mb-2 text-2xl font-bold leading-snug text-stone-900 sm:text-3xl">
              ¿Cuál es tu motivo de consulta?
            </h2>

            {/* Mode toggle */}
            <div className="mb-6 flex gap-2">
              <button
                onClick={() => setInputMode('voice')}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  inputMode === 'voice'
                    ? 'bg-sky-600 text-white shadow-lg'
                    : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                }`}
              >
                <Mic className="h-4 w-4" />
                Hablar
              </button>
              <button
                onClick={() => setInputMode('text')}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  inputMode === 'text'
                    ? 'bg-sky-600 text-white shadow-lg'
                    : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                }`}
              >
                <Send className="h-4 w-4" />
                Escribir
              </button>
            </div>

            {inputMode === 'voice' ? (
              <VoiceAnamnesis
                onDataExtracted={handleVoiceDataExtracted}
                onSwitchToText={() => setInputMode('text')}
              />
            ) : (
              <>
                <p className="mb-4 text-sm text-stone-400">
                  Describí brevemente tus síntomas o el motivo por el que necesitás atención médica
                </p>

                <textarea
                  ref={textareaRef}
                  value={chiefComplaint}
                  onChange={e => setChiefComplaint(e.target.value)}
                  placeholder="Ej: Tengo dolor de cabeza del lado derecho desde hace 3 días..."
                  className="w-full rounded-2xl border border-stone-200 bg-stone-50 p-4 text-lg text-stone-900 placeholder:text-stone-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 resize-none"
                  rows={4}
                  maxLength={2000}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleChiefComplaintSubmit()
                    }
                  }}
                />

                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-stone-300">
                    {chiefComplaint.length > 0 ? `${chiefComplaint.length}/2000` : ''}
                  </span>
                  <button
                    onClick={handleChiefComplaintSubmit}
                    disabled={chiefComplaint.trim().length < 5 || aiLoading}
                    className="flex items-center gap-2 rounded-full bg-sky-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {aiLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Analizando...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Enviar
                      </>
                    )}
                  </button>
                </div>

                {aiError && (
                  <p className="mt-3 text-xs text-amber-600">
                    El análisis automático no está disponible. Continuamos con el cuestionario clínico.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* ====== PHASE 2: AI Follow-up Questions ====== */}
        {phase === 'ai_questions' && aiQuestions[aiQuestionIndex] && (
          <AiQuestionView
            ref={questionRef}
            question={aiQuestions[aiQuestionIndex]}
            questionNumber={aiQuestionIndex + 1}
            totalQuestions={aiQuestions.length}
            urgencyLevel={urgencyLevel}
            onAnswer={handleAiAnswer}
            onBack={aiQuestionIndex > 0
              ? () => setAiQuestionIndex(prev => prev - 1)
              : () => setPhase('chief_complaint')
            }
          />
        )}

        {/* ====== PHASE 3: Structured Questions ====== */}
        {phase === 'structured' && current && (
          <>
            {/* Chat history */}
            {history.length > 0 && (
              <div className="mb-6 space-y-3">
                {history.slice(-3).map(q => {
                  const val = getAnswer(q.key)
                  return (
                    <div key={q.key} className="flex items-start gap-3 opacity-40">
                      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-100">
                        <Check className="h-3.5 w-3.5 text-sky-600" />
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

            <div ref={questionRef} className="py-4">
              <div className="mb-2 flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-sky-600" />
                <span className="text-xs font-medium text-sky-600 uppercase tracking-wide">
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
                onSubmit={handleStructuredAnswer}
              />
            </div>

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
          </>
        )}
      </div>

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

// --- AI Question Component ---

import { forwardRef } from 'react'

interface AiQuestionViewProps {
  question: AiQuestion
  questionNumber: number
  totalQuestions: number
  urgencyLevel: 'normal' | 'attention' | 'urgent'
  onAnswer: (answer: string) => void
  onBack: () => void
}

const AiQuestionView = forwardRef<HTMLDivElement, AiQuestionViewProps>(
  function AiQuestionView({ question, questionNumber, totalQuestions, urgencyLevel, onAnswer, onBack }, ref) {
    const [value, setValue] = useState('')
    const [selected, setSelected] = useState<string | null>(null)

    const handleSubmit = () => {
      if (question.type === 'closed') {
        if (selected) onAnswer(selected)
      } else if (question.type === 'select') {
        if (selected) onAnswer(selected)
      } else if (question.type === 'scale') {
        if (value) onAnswer(value)
      } else {
        if (value.trim()) onAnswer(value.trim())
      }
    }

    const priorityBadge = question.priority === 'critical'
      ? 'bg-red-100 text-red-700'
      : question.priority === 'high'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-stone-100 text-stone-500'

    return (
      <div ref={ref} className="py-8">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-sky-600" />
          <span className="text-xs font-medium text-sky-600 uppercase tracking-wide">
            AutaMedica IA — Pregunta {questionNumber}/{totalQuestions}
          </span>
          {question.priority === 'critical' && (
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${priorityBadge}`}>
              Importante
            </span>
          )}
        </div>

        {urgencyLevel === 'urgent' && questionNumber === 1 && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3">
            <p className="text-sm font-medium text-red-800">
              Identificamos síntomas que requieren evaluación prioritaria. Completá estas preguntas para que tu médico tenga la información necesaria.
            </p>
          </div>
        )}

        <h2 className="mb-6 text-xl font-bold leading-snug text-stone-900 sm:text-2xl">
          {question.question}
        </h2>

        {/* Render by question type */}
        {question.type === 'open' && (
          <div>
            <textarea
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="Tu respuesta..."
              className="w-full rounded-2xl border border-stone-200 bg-stone-50 p-4 text-lg text-stone-900 placeholder:text-stone-300 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 resize-none"
              rows={3}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
            />
            <div className="mt-3 flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={!value.trim()}
                className="rounded-full bg-sky-600 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:bg-sky-700 disabled:opacity-40"
              >
                Confirmar
              </button>
            </div>
          </div>
        )}

        {question.type === 'closed' && (
          <div className="space-y-3">
            {['Sí', 'No'].map(opt => (
              <button
                key={opt}
                onClick={() => { setSelected(opt); onAnswer(opt) }}
                className={`w-full rounded-2xl border-2 p-4 text-left text-lg font-medium transition-all ${
                  selected === opt
                    ? 'border-sky-500 bg-sky-50 text-sky-900'
                    : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {question.type === 'select' && question.options && (
          <div className="space-y-3">
            {question.options.map(opt => (
              <button
                key={opt}
                onClick={() => { setSelected(opt); onAnswer(opt) }}
                className={`w-full rounded-2xl border-2 p-4 text-left text-lg font-medium transition-all ${
                  selected === opt
                    ? 'border-sky-500 bg-sky-50 text-sky-900'
                    : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {question.type === 'scale' && (
          <div>
            <div className="flex justify-between text-xs text-stone-400 mb-2">
              <span>Nada</span>
              <span>Máximo</span>
            </div>
            <div className="flex gap-2">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  onClick={() => { setValue(String(n)); onAnswer(String(n)) }}
                  className={`flex-1 rounded-xl py-3 text-lg font-bold transition-all ${
                    value === String(n)
                      ? 'bg-sky-600 text-white'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Back */}
        <div className="mt-6">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-medium text-stone-400 hover:text-stone-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Anterior
          </button>
        </div>
      </div>
    )
  },
)

// --- Helpers ---

function formatAnswer(val: AnamnesisFieldValue): string {
  if (val == null) return '-'
  if (typeof val === 'boolean') return val ? 'Sí' : 'No'
  if (typeof val === 'number') return String(val)
  if (Array.isArray(val)) return val.length > 0 ? val.join(', ') : 'Ninguno'
  return String(val)
}
