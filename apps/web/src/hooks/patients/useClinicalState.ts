'use client'

/**
 * useClinicalState — React hook for managing the Canonical Clinical State.
 *
 * This hook:
 * 1. Initializes the state from persisted DB data on load
 * 2. Hydrates it from already-completed sections
 * 3. Exposes normalizeForm/normalizeVoice for incremental updates
 * 4. Auto-persists with debounce
 * 5. Provides prompt snapshot + planned questions for Gemini
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { logger } from '@autamedica/shared'
import { fetchApi } from '@/lib/api-client'
import type {
  ClinicalCaseState,
  CanonicalField,
  NormalizerResult,
  PlannerOutput,
  SegmentKey,
  WorkflowType,
} from '@/lib/patients/clinical-state/types'
import {
  createEmptyState,
  normalizeFormData,
  normalizeVoiceExtraction,
  planQuestions,
  buildPromptText,
  buildPromptSnapshot,
  resolveCanonicalKey,
  reverseCanonicalKey,
  lockField,
  normalize,
} from '@/lib/patients/clinical-state'
import { flattenAllFields } from '@/lib/patients/clinical-state/canonical-field'
import {
  resolveFieldUXState,
  summarizeStepFields,
  type FieldUXState,
} from '@/lib/patients/clinical-state/field-ux-state'
import type { PsychiatryIntakeSectionRecord } from '@/lib/patients/types/psychiatry-intake'

interface UseClinicalStateOptions {
  patientId: string | null
  caseId?: string | null
  workflowType?: WorkflowType
  sections: PsychiatryIntakeSectionRecord[]
  loading: boolean
}

interface UseClinicalStateReturn {
  clinicalState: ClinicalCaseState | null
  /** Normalize form data into the canonical state */
  mergeFormData: (
    formData: Record<string, unknown>,
    segment: SegmentKey,
    options?: {
      explicitConfirmation?: boolean
      source?: 'ui_form' | 'persisted_db' | 'doctor_review'
      confidence?: 'low' | 'medium' | 'high'
    },
  ) => NormalizerResult | null
  /** Normalize voice extraction into the canonical state */
  mergeVoiceData: (
    extractedFields: Record<string, unknown>,
    rawTranscript: string,
    segment: SegmentKey,
  ) => NormalizerResult | null
  /** Lookup a canonical field by form field ID and step ID */
  getCanonicalField: (fieldId: string, stepId: string) => CanonicalField<unknown> | null
  /** Lookup the UX state for a field */
  getFieldUiState: (fieldId: string, stepId: string) => FieldUXState
  /** Fill a step draft with resolved canonical values */
  hydrateStepData: (stepId: string, draftData?: Record<string, unknown>) => Record<string, unknown>
  /** Summary for a step */
  getStepSummary: (stepId: string, fieldIds?: string[]) => StepUiSummary
  /** UX mode for a step */
  getStepMode: (stepId: string, fieldIds?: string[]) => StepUiMode
  /** Confirm and lock a field value */
  confirmField: (fieldId: string, stepId: string, overrideValue?: unknown) => void
  /** Get planned questions for a segment */
  getPlannedQuestions: (segmentFilter?: SegmentKey) => PlannerOutput | null
  /** Get the prompt text for Gemini */
  getPromptSnapshot: () => string
  /** Build explicit voice context from canonical state */
  getVoiceContext: (segmentFilter?: SegmentKey) => VoiceContextSnapshot | null
  /** Force persist to DB */
  persistNow: () => Promise<void>
  /** Reset local state for the current case without reusing prior answers */
  resetState: (nextWorkflowType?: WorkflowType) => void
  /** Whether the state has been initialized */
  initialized: boolean
}

export type StepUiMode = 'capture' | 'confirm' | 'resolve_conflicts' | 'review'

export interface StepUiSummary {
  total: number
  completed: number
  pending: number
  conflicts: number
  needsConfirmation: number
  mode: StepUiMode
  knownValues: Array<{ fieldId: string; value: unknown }>
  missingFieldIds: string[]
  conflictFieldIds: string[]
}

export interface VoiceContextSnapshot {
  knownFacts: string[]
  doNotAsk: string[]
  missing: string[]
  conflicts: Array<{
    fieldKey: string
    reason?: string
    currentValue: unknown
    previousValue?: unknown
  }>
  suggestedQuestions: string[]
  summaryText: string
}

/** Single source of truth for section→segment mapping */
import { STEP_TO_SEGMENT as SECTION_TO_SEGMENT } from '@/lib/patients/usecases/psychiatry-intake-flow.usecase'

const PERSIST_DEBOUNCE_MS = 5000

function inferStepMode(summary: Pick<StepUiSummary, 'conflicts' | 'needsConfirmation' | 'pending'>): StepUiMode {
  if (summary.conflicts > 0) return 'resolve_conflicts'
  if (summary.needsConfirmation > 0) return 'confirm'
  if (summary.pending > 0) return 'capture'
  return 'review'
}

export function useClinicalState({
  patientId,
  caseId = null,
  workflowType = 'psychiatry_first_visit',
  sections,
  loading,
}: UseClinicalStateOptions): UseClinicalStateReturn {
  const [clinicalState, setClinicalState] = useState<ClinicalCaseState | null>(null)
  const [initialized, setInitialized] = useState(false)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stateRef = useRef<ClinicalCaseState | null>(null)

  // Keep ref in sync
  useEffect(() => {
    stateRef.current = clinicalState
  }, [clinicalState])

  // ── Persist to backend (debounced) ──
  const schedulePersist = useCallback(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current)
    }

    persistTimerRef.current = setTimeout(async () => {
      const state = stateRef.current
      if (!state) return

      try {
        await fetchApi('/api/patients/clinical-state/save', {
          method: 'POST',
          body: { state },
        })
        logger.info('[useClinicalState] State persisted', {
          caseId: state.caseId,
          integrityScore: state.integrity?.intakeIntegrityScore ?? 100,
        })
      } catch (err) {
        logger.warn('[useClinicalState] Persist failed (will retry on next change)', err)
      }
    }, PERSIST_DEBOUNCE_MS)
  }, [])

  const persistNow = useCallback(async () => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
    }

    const state = stateRef.current
    if (!state) return

    try {
      await fetchApi('/api/patients/clinical-state/save', {
        method: 'POST',
        body: { state },
      })
    } catch (err) {
      logger.warn('[useClinicalState] persistNow failed', err)
    }
  }, [])

  const resetState = useCallback((nextWorkflowType?: WorkflowType) => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
    }

    if (!patientId || !caseId) {
      stateRef.current = null
      setClinicalState(null)
      setInitialized(false)
      return
    }

    const freshState = createEmptyState(caseId, patientId, nextWorkflowType ?? workflowType)
    stateRef.current = freshState
    setClinicalState(freshState)
    setInitialized(true)
  }, [caseId, patientId, workflowType])

  // ── Initialize: try loading from DB, then hydrate from sections ──
  useEffect(() => {
    // If patient changed, reset state
    if (initialized && (stateRef.current?.patientId !== patientId || stateRef.current?.caseId !== caseId)) {
      stateRef.current = null
      setInitialized(false)
      setClinicalState(null)
      return
    }

    if (loading || !patientId || !caseId || initialized) return

    let mounted = true

    async function init() {
      let state: ClinicalCaseState | null = null

      // 1. Try loading persisted state
      try {
        const query = new URLSearchParams({ patientId })
        if (caseId) query.set('caseId', caseId)

        const response = await fetchApi<{ state: ClinicalCaseState | null }>(
          `/api/patients/clinical-state/save?${query.toString()}`,
          { method: 'GET' },
        )
        if (response?.state) {
          state = response.state
          logger.info('[useClinicalState] Loaded persisted state', {
            caseId: state.caseId,
            integrityScore: state.integrity?.intakeIntegrityScore ?? 100,
          })
        }
      } catch {
        // No persisted state, will create fresh
      }

      if (!mounted) return

      // 2. If no persisted state, create fresh and hydrate from sections
      if (!state) {
        state = createEmptyState(caseId, patientId, workflowType)

        // Hydrate from already-completed sections
        for (const section of sections) {
          if (!section.completed || !section.data) continue

          const segment = SECTION_TO_SEGMENT[section.section]
          if (!segment) continue

          const data = section.data as Record<string, unknown>
          const result = normalizeFormData(state, data, segment, {
            explicitConfirmation: true,
            source: 'persisted_db',
          })
          state = result.state
        }

        logger.info('[useClinicalState] Created fresh state from sections', {
          caseId: state.caseId,
          sectionsHydrated: sections.filter(s => s.completed).length,
          missingFields: state.planner?.missingFieldKeys?.length ?? 0,
        })
      }

      stateRef.current = state
      setClinicalState(state)
      setInitialized(true)
    }

    init()
    
    return () => {
      mounted = false
    }
  }, [loading, patientId, caseId, workflowType, sections, initialized])

  // ── Merge form data ──
  const mergeFormData = useCallback((
    formData: Record<string, unknown>,
    segment: SegmentKey,
    options?: {
      explicitConfirmation?: boolean
      source?: 'ui_form' | 'persisted_db' | 'doctor_review'
      confidence?: 'low' | 'medium' | 'high'
    },
  ): NormalizerResult | null => {
    const current = stateRef.current
    if (!current) return null

    const result = normalizeFormData(current, formData, segment, options)
    stateRef.current = result.state
    setClinicalState(result.state)
    schedulePersist()

    return result
  }, [schedulePersist])

  // ── Merge voice extraction data ──
  const mergeVoiceData = useCallback((
    extractedFields: Record<string, unknown>,
    rawTranscript: string,
    segment: SegmentKey,
  ): NormalizerResult | null => {
    const current = stateRef.current
    if (!current) return null

    const result = normalizeVoiceExtraction(current, extractedFields, rawTranscript, segment)
    stateRef.current = result.state
    setClinicalState(result.state)
    schedulePersist()

    return result
  }, [schedulePersist])

  // ── Get planned questions ──
  const getPlannedQuestions = useCallback((segmentFilter?: SegmentKey): PlannerOutput | null => {
    const current = stateRef.current
    if (!current) return null

    return planQuestions(current, { segmentFilter, maxQuestions: 5 })
  }, [])

  // ── Get prompt snapshot text ──
  const getPromptSnapshot = useCallback((): string => {
    const current = stateRef.current
    if (!current) return ''

    return buildPromptText(current)
  }, [])

  const getVoiceContext = useCallback((segmentFilter?: SegmentKey): VoiceContextSnapshot | null => {
    const current = stateRef.current
    if (!current) return null

    const snapshot = buildPromptSnapshot(current)
    const allFields = flattenAllFields(current)
    const planned = segmentFilter ? planQuestions(current, { segmentFilter, maxQuestions: 5 }) : null

    return {
      knownFacts: [
        ...snapshot.confirmedFacts,
        ...snapshot.derivedFacts,
        ...snapshot.draftFacts,
      ].map((fact) => `${fact.fieldKey}: ${String(fact.value)}`),
      doNotAsk: snapshot.doNotAskFacts,
      missing: [
        ...snapshot.safetyCriticalFacts,
        ...snapshot.priorityMissingFacts,
      ],
      conflicts: allFields
        .filter((field) => field.status === 'conflicted')
        .map((field) => ({
          fieldKey: field.key,
          reason: field.conflictReason,
          currentValue: field.value,
          previousValue: field.previousValue,
        })),
      suggestedQuestions: planned?.questions.map((question) => question.prompt) ?? current.planner?.nextRecommendedQuestions ?? [],
      summaryText: buildPromptText(current),
    }
  }, [])

  // ── Look up a canonical field by form fieldId ──
  const getCanonicalField = useCallback((fieldId: string, _stepId: string): CanonicalField<unknown> | null => {
    const current = stateRef.current
    if (!current) return null

    const canonicalKey = resolveCanonicalKey(fieldId)
    const [sectionName, fieldName] = canonicalKey.split('.')
    if (!sectionName || !fieldName) return null

    const section = (current as unknown as Record<string, Record<string, unknown>>)[sectionName]
    if (!section) return null

    const field = section[fieldName]
    if (!field || typeof field !== 'object' || !('key' in (field as Record<string, unknown>))) {
      return null
    }

    return field as CanonicalField<unknown>
  }, [])

  const getFieldUiState = useCallback((fieldId: string, stepId: string): FieldUXState => {
    return resolveFieldUXState(getCanonicalField(fieldId, stepId))
  }, [getCanonicalField])

  const hydrateStepData = useCallback((_stepId: string, draftData: Record<string, unknown> = {}) => {
    const current = stateRef.current
    if (!current) return draftData

    // Provide values mapped backwards into UI specific field keys
    const hydrated = { ...draftData }
    const allFields = flattenAllFields(current)

    for (const field of allFields) {
      if (field.value == null) continue

      const rawKey = reverseCanonicalKey(field.key)
      if (hydrated[rawKey] == null || hydrated[rawKey] === '') {
        hydrated[rawKey] = field.value
      }
    }

    return hydrated
  }, [])

  const getStepSummary = useCallback((stepId: string, fieldIds: string[] = []): StepUiSummary => {
    const fields = fieldIds
      .map((fieldId) => getCanonicalField(fieldId, stepId))
      .filter((field): field is CanonicalField<unknown> => Boolean(field))

    const base = summarizeStepFields(fields)
    return {
      ...base,
      mode: inferStepMode(base),
      knownValues: fields
        .filter((field) => field.value != null)
        .map((field) => ({ fieldId: field.key, value: field.value })),
      missingFieldIds: fields
        .filter((field) => resolveFieldUXState(field).mode === 'capture')
        .map((field) => field.key),
      conflictFieldIds: fields
        .filter((field) => resolveFieldUXState(field).mode === 'conflict')
        .map((field) => field.key),
    }
  }, [getCanonicalField])

  const getStepMode = useCallback((stepId: string, fieldIds: string[] = []): StepUiMode => {
    return getStepSummary(stepId, fieldIds).mode
  }, [getStepSummary])

  // ── Confirm and lock a field ──
  const confirmField = useCallback((fieldId: string, stepId: string, overrideValue?: unknown): void => {
    const current = stateRef.current
    if (!current) return

    const field = getCanonicalField(fieldId, stepId)
    const valueToConfirm = overrideValue ?? field?.value
    if (valueToConfirm == null || valueToConfirm === '') return

    // Route firmly through normalization engine to update planner & integrity recursively
    const segment = SECTION_TO_SEGMENT[stepId] ?? current.workflow.currentSegment
    
    const result = normalize(current, {
      caseId: current.caseId,
      patientId: current.patientId,
      workflowType: current.workflow.type,
      segment,
      data: [{
        fieldKey: field?.key ?? resolveCanonicalKey(fieldId),
        value: valueToConfirm,
        source: 'doctor_review',
        sourceSegment: segment,
        confidence: 'high',
        timestamp: new Date().toISOString(),
        explicitConfirmation: true, // Forces state confirming
      }],
    })

    // Also manually lock it 
    const lockedState = { ...result.state }
    const canonicalKey = field?.key ?? resolveCanonicalKey(fieldId)
    const [sectionName, fieldName] = canonicalKey.split('.')
    if (sectionName && fieldName) {
      const sectionObj = (lockedState as unknown as Record<string, Record<string, unknown>>)[sectionName]
      if (sectionObj?.[fieldName]) {
         sectionObj[fieldName] = lockField(sectionObj[fieldName] as CanonicalField<unknown>)
      }
    }

    stateRef.current = lockedState
    setClinicalState(lockedState)
    schedulePersist()
  }, [getCanonicalField, schedulePersist])

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current)
      }
    }
  }, [])

  return {
    clinicalState,
    mergeFormData,
    mergeVoiceData,
    getCanonicalField,
    getFieldUiState,
    hydrateStepData,
    getStepSummary,
    getStepMode,
    confirmField,
    getPlannedQuestions,
    getPromptSnapshot,
    getVoiceContext,
    persistNow,
    resetState,
    initialized,
  }
}
