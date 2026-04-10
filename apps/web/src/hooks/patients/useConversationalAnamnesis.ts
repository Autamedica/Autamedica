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
  /** Whether this is a revisit (patient has previously completed sections) */
  isRevisit: boolean
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

  // Detect which sections were previously completed (for revisit logic)
  const previouslyCompleted = useMemo(() => {
    if (!initialData) return new Set<string>()
    const completed = new Set<string>()
    for (const step of anamnesisSteps) {
      const stepData = initialData[step.id]
      if (!stepData) continue
      const requiredFields = step.fields.filter(f => f.required)
      if (requiredFields.length === 0) {
        completed.add(step.id)
        continue
      }
      const allFilled = requiredFields.every(f => {
        const val = stepData[f.id]
        return val != null && val !== '' && !(Array.isArray(val) && val.length === 0)
      })
      if (allFilled) completed.add(step.id)
    }
    return completed
  }, [initialData])

  // Flatten all fields from all steps into a linear queue
  // On revisit, respects mutability (skip carry_forward, inject confirmations)
  const allQuestions = useMemo<ConversationalQuestion[]>(
    () => flattenAll(previouslyCompleted),
    [previouslyCompleted],
  )

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
    // Start with carried-forward data from initialData (so skipped sections don't lose data)
    const grouped: Record<string, Record<string, AnamnesisFieldValue>> = {}
    if (initialData) {
      for (const [stepId, fields] of Object.entries(initialData)) {
        grouped[stepId] = { ...fields }
      }
    }
    // Overlay current answers (new + updated)
    for (const [key, value] of Object.entries(answers)) {
      const dotIdx = key.indexOf('.')
      const stepId = key.substring(0, dotIdx)
      const fieldId = key.substring(dotIdx + 1)
      // Skip synthetic revisit fields — they're UI-only
      if (fieldId.startsWith('_revisit_')) continue
      if (!grouped[stepId]) grouped[stepId] = {}
      grouped[stepId][fieldId] = value
    }
    return grouped
  }, [answers, initialData])

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

  const [partialFired, setPartialFired] = useState(false)

  const shouldCheckpoint = useCallback((): 'partial' | 'final' | null => {
    if (!current) return null
    if (isLast) return 'final'
    const answeredCount = Object.keys(answers).length
    const result = evaluateCheckpoint(answeredCount, partialFired)
    if (result === 'partial') setPartialFired(true)
    return result
  }, [current, isLast, answers, partialFired])

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
    isRevisit: previouslyCompleted.size > 0,
  }
}

// --- Pure helpers ---

/**
 * Synthetic field for revisit confirmation questions.
 * "¿Cambió algo en X?" or "¿Hay algo nuevo en X?"
 */
function makeRevisitField(step: typeof anamnesisSteps[number]): AnamnesisField {
  const isAdditive = step.mutability === 'carry_forward_additive'
  return {
    id: `_revisit_${step.id}`,
    type: 'boolean',
    label: isAdditive
      ? `¿Hay algo nuevo en ${step.title.replace(/^[^\s]+ /, '')}?`
      : `¿Cambió algo en ${step.title.replace(/^[^\s]+ /, '')}?`,
    required: true,
    tooltip: isAdditive
      ? 'Si descubriste algo nuevo desde tu última visita, respondé Sí'
      : 'Si algo cambió desde tu última visita, respondé Sí para actualizar',
  }
}

/**
 * Flattens anamnesis steps into a conversational queue.
 * On revisit (completedSections not empty), respects mutability:
 * - carry_forward: skip entirely (data carried from previous)
 * - carry_forward_additive: ask "anything new?" → if yes, show fields
 * - confirm_on_revisit: ask "did anything change?" → if yes, show fields
 * - per_visit: always show all fields
 */
function flattenAll(
  completedSections?: Set<string>,
): ConversationalQuestion[] {
  const isRevisit = completedSections && completedSections.size > 0
  const questions: ConversationalQuestion[] = []
  let rawIndex = 0

  for (const step of anamnesisSteps) {
    // Skip resumen_final — handled separately
    if (step.id === 'resumen_final') continue

    const wasCompleted = isRevisit && completedSections.has(step.id)

    if (wasCompleted) {
      switch (step.mutability) {
        case 'carry_forward':
          // Skip entirely — data persists from previous completion
          continue

        case 'carry_forward_additive':
        case 'confirm_on_revisit': {
          // Inject synthetic boolean: "anything new?" / "did anything change?"
          const revisitField = makeRevisitField(step)
          questions.push({
            key: `${step.id}.${revisitField.id}`,
            stepId: step.id,
            field: revisitField,
            rawIndex: rawIndex++,
          })
          // Original fields are conditional on revisit answer = true
          for (const field of step.fields) {
            const conditionalField: AnamnesisField = {
              ...field,
              dependsOn: {
                fieldId: revisitField.id,
                value: true,
              },
            }
            questions.push({
              key: `${step.id}.${field.id}`,
              stepId: step.id,
              field: conditionalField,
              rawIndex: rawIndex++,
            })
          }
          continue
        }

        case 'per_visit':
        default:
          // Fall through to normal handling
          break
      }
    }

    // Normal: show all fields (first visit or per_visit on revisit)
    for (const field of step.fields) {
      questions.push({
        key: `${step.id}.${field.id}`,
        stepId: step.id,
        field,
        rawIndex: rawIndex++,
      })
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
    const depValue = q.field.dependsOn.value
    const actualValue = answers[depKey]

    if (Array.isArray(depValue)) {
      return depValue.includes(actualValue as never)
    }
    return actualValue === depValue
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

/** Threshold: trigger partial checkpoint after this many answers */
export const PARTIAL_AFTER_N_ANSWERS = 15

/**
 * Pure function: determines if a checkpoint should fire based on answer count.
 * - 'partial': fires once when answeredCount reaches PARTIAL_AFTER_N_ANSWERS
 * - 'final': caller must check isLast separately (hook handles this)
 * - null: no checkpoint
 */
export function evaluateCheckpoint(
  answeredCount: number,
  partialAlreadyFired: boolean,
): 'partial' | null {
  if (!partialAlreadyFired && answeredCount >= PARTIAL_AFTER_N_ANSWERS) {
    return 'partial'
  }
  return null
}
