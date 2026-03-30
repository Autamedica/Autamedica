'use client'

import { useCallback, useMemo, useState } from 'react'
import { anamnesisSteps } from '@/lib/patients/data/anamnesis-steps'
import type { AnamnesisField, AnamnesisFieldValue } from '@/lib/patients/types/anamnesis'

export interface ConversationalQuestion {
  /** Unique key: stepId.fieldId */
  key: string
  stepId: string
  field: AnamnesisField
  /** 0-based index in the flat queue (before filtering) */
  rawIndex: number
}

interface UseConversationalAnamnesisReturn {
  /** Current question to display */
  current: ConversationalQuestion | null
  /** 0-based index in visible queue */
  currentIndex: number
  /** Total visible questions */
  totalVisible: number
  /** Progress 0-100 */
  progressPct: number
  /** All answers keyed by stepId.fieldId */
  answers: Record<string, AnamnesisFieldValue>
  /** Answered questions for chat history */
  history: ConversationalQuestion[]
  /** Answer current question and advance */
  answer: (value: AnamnesisFieldValue) => void
  /** Go back one question */
  goBack: () => void
  /** Whether we're on the last visible question */
  isLast: boolean
  /** Whether we're on the first question */
  isFirst: boolean
  /** Get answer for a specific key */
  getAnswer: (key: string) => AnamnesisFieldValue
  /** Get form data grouped by stepId (compatible with existing save) */
  getFormData: () => Record<string, Record<string, AnamnesisFieldValue>>
  /** Current step ID for saving */
  currentStepId: string | null
  /** Whether a checkpoint should fire (after step 6 boundary) */
  shouldCheckpoint: () => 'partial' | 'final' | null
  /** Set of completed stepIds based on answered fields */
  completedStepIds: Set<string>
}

/**
 * Flattens anamnesis steps into a conversational queue.
 * Evaluates dependsOn in real-time so conditional questions appear/disappear.
 * Compatible with existing save model (grouped by stepId).
 */
export function useConversationalAnamnesis(
  initialData?: Record<string, Record<string, AnamnesisFieldValue>>,
): UseConversationalAnamnesisReturn {
  const [answers, setAnswers] = useState<Record<string, AnamnesisFieldValue>>(() => {
    if (!initialData) return {}
    const flat: Record<string, AnamnesisFieldValue> = {}
    for (const [stepId, fields] of Object.entries(initialData)) {
      for (const [fieldId, value] of Object.entries(fields)) {
        if (value != null && value !== '') {
          flat[`${stepId}.${fieldId}`] = value
        }
      }
    }
    return flat
  })

  const [currentIndex, setCurrentIndex] = useState(() => {
    // Resume from first unanswered question
    if (!initialData) return 0
    const allQuestions = flattenAll()
    const visible = filterVisible(allQuestions, buildAnswers(initialData))
    const firstUnanswered = visible.findIndex(q => {
      const key = q.key
      const val = buildAnswers(initialData)[key]
      return val == null || val === ''
    })
    return firstUnanswered === -1 ? visible.length - 1 : firstUnanswered
  })

  // Flatten all fields from all steps into a linear queue
  const allQuestions = useMemo<ConversationalQuestion[]>(() => flattenAll(), [])

  // Filter by dependsOn using current answers
  const visibleQuestions = useMemo(
    () => filterVisible(allQuestions, answers),
    [allQuestions, answers],
  )

  const current = visibleQuestions[currentIndex] ?? null
  const totalVisible = visibleQuestions.length
  const isLast = currentIndex >= totalVisible - 1
  const isFirst = currentIndex === 0

  const answeredQuestions = useMemo(
    () => visibleQuestions.slice(0, currentIndex),
    [visibleQuestions, currentIndex],
  )

  const progressPct = totalVisible > 0
    ? Math.round((currentIndex / totalVisible) * 100)
    : 0

  const answerQuestion = useCallback((value: AnamnesisFieldValue) => {
    if (!current) return
    setAnswers(prev => ({ ...prev, [current.key]: value }))
    if (!isLast) {
      setCurrentIndex(prev => prev + 1)
    }
  }, [current, isLast])

  const goBack = useCallback(() => {
    if (!isFirst) {
      setCurrentIndex(prev => prev - 1)
    }
  }, [isFirst])

  const getAnswer = useCallback((key: string): AnamnesisFieldValue => {
    return answers[key] ?? null
  }, [answers])

  const getFormData = useCallback((): Record<string, Record<string, AnamnesisFieldValue>> => {
    const grouped: Record<string, Record<string, AnamnesisFieldValue>> = {}
    for (const [key, value] of Object.entries(answers)) {
      const dotIdx = key.indexOf('.')
      const stepId = key.substring(0, dotIdx)
      const fieldId = key.substring(dotIdx + 1)
      if (!grouped[stepId]) grouped[stepId] = {}
      grouped[stepId][fieldId] = value
    }
    return grouped
  }, [answers])

  const currentStepId = current?.stepId ?? null

  // Track which steps have all required fields answered
  const completedStepIds = useMemo(() => {
    const completed = new Set<string>()
    for (const step of anamnesisSteps) {
      const requiredFields = step.fields.filter(f => f.required)
      if (requiredFields.length === 0) {
        completed.add(step.id)
        continue
      }
      const allAnswered = requiredFields.every(f => {
        const key = `${step.id}.${f.id}`
        const val = answers[key]
        return val != null && val !== '' && !(Array.isArray(val) && val.length === 0)
      })
      if (allAnswered) completed.add(step.id)
    }
    return completed
  }, [answers])

  const shouldCheckpoint = useCallback((): 'partial' | 'final' | null => {
    if (!current) return null
    // Check if we just crossed from step 6 to step 7
    const prevQ = currentIndex > 0 ? visibleQuestions[currentIndex - 1] : null
    if (prevQ) {
      const prevStepIdx = anamnesisSteps.findIndex(s => s.id === prevQ.stepId)
      const currStepIdx = anamnesisSteps.findIndex(s => s.id === current.stepId)
      if (prevStepIdx < 6 && currStepIdx >= 6) return 'partial'
    }
    if (isLast) return 'final'
    return null
  }, [current, currentIndex, visibleQuestions, isLast])

  return {
    current,
    currentIndex,
    totalVisible,
    progressPct,
    answers,
    history: answeredQuestions,
    answer: answerQuestion,
    goBack,
    isLast,
    isFirst,
    getAnswer,
    getFormData,
    currentStepId,
    shouldCheckpoint,
    completedStepIds,
  }
}

// --- Pure helpers ---

function flattenAll(): ConversationalQuestion[] {
  const questions: ConversationalQuestion[] = []
  let rawIndex = 0
  for (const step of anamnesisSteps) {
    // Skip resumen_final — it's a confirmation, not a question
    if (step.id === 'resumen_final') continue
    for (const field of step.fields) {
      questions.push({
        key: `${step.id}.${field.id}`,
        stepId: step.id,
        field,
        rawIndex,
      })
      rawIndex++
    }
  }
  return questions
}

function filterVisible(
  all: ConversationalQuestion[],
  answers: Record<string, AnamnesisFieldValue>,
): ConversationalQuestion[] {
  return all.filter(q => {
    if (!q.field.dependsOn) return true
    const depKey = `${q.stepId}.${q.field.dependsOn.fieldId}`
    return answers[depKey] === q.field.dependsOn.value
  })
}

function buildAnswers(
  data: Record<string, Record<string, AnamnesisFieldValue>>,
): Record<string, AnamnesisFieldValue> {
  const flat: Record<string, AnamnesisFieldValue> = {}
  for (const [stepId, fields] of Object.entries(data)) {
    for (const [fieldId, value] of Object.entries(fields)) {
      flat[`${stepId}.${fieldId}`] = value
    }
  }
  return flat
}
