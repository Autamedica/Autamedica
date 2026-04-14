'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePatientSession } from '@/hooks/patients/usePatientSession'
import { usePsychiatryIntake } from '@/hooks/patients/usePsychiatryIntake'
import { useClinicalState } from '@/hooks/patients/useClinicalState'
import { useAuthRedirect } from '@/hooks/patients/useAuthRedirect'
import { usePsychiatryWizardNav } from '@/hooks/patients/usePsychiatryWizardNav'
import { usePsychiatryPersistence } from '@/hooks/patients/usePsychiatryPersistence'
import {
  STEP_TO_SEGMENT,
  buildFormData,
  resolveWorkflowType,
  deriveStepStatuses,
  computeVisibleFields,
} from '@/lib/patients/usecases/psychiatry-intake-flow.usecase'
import type { AnamnesisField, AnamnesisFieldValue } from '@/lib/patients/types/anamnesis'
import type { PsychiatryFormData } from '@/lib/patients/types/psychiatry-intake'

export function usePsychiatryIntakeFlow() {
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
    resetIntake,
  } = usePsychiatryIntake()

  // Auth redirect
  useAuthRedirect(authRequired, '/patients/psychiatry')

  // Form data
  const [formData, setFormData] = useState<PsychiatryFormData>({})

  useEffect(() => {
    if (!loading) {
      setFormData(buildFormData(sections, patientBirthDate))
    }
  }, [loading, sections, patientBirthDate])

  // Clinical state
  const workflowType = resolveWorkflowType(formData)
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
    resetState: resetClinicalState,
  } = useClinicalState({
    patientId: patient?.id ?? null,
    caseId: intake?.id ?? null,
    workflowType,
    sections,
    loading,
  })

  // Persistence (needs currentStep/data — we'll wire it after nav)
  // We create a temporary ref-based approach: persistence options update each render
  const persistenceCurrentStepRef = useMemo(() => ({ current: null as unknown }), [])
  const persistenceStepDataRef = useMemo(() => ({ current: {} as Record<string, AnamnesisFieldValue> }), [])
  const persistenceVisibleFieldsRef = useMemo(() => ({ current: [] as AnamnesisField[] }), [])

  const persistence = usePsychiatryPersistence({
    get currentStep() { return persistenceCurrentStepRef.current as Parameters<typeof usePsychiatryPersistence>[0]['currentStep'] },
    get currentStepData() { return persistenceStepDataRef.current },
    get currentPhaseId() { return nav.currentPhaseId },
    get visibleFields() { return persistenceVisibleFieldsRef.current },
    updateSection,
    resetIntake,
    commitStepData: (stepId, data) => {
      const segment = STEP_TO_SEGMENT[stepId]
      if (!segment) return
      mergeIntoClinicalState(data, segment, {
        explicitConfirmation: true,
      })
    },
    persistClinicalState,
  })

  // Step statuses need getFieldUiState which comes from clinical state
  const navStepStatusesRef = useMemo(() => ({ current: [] as ReturnType<typeof deriveStepStatuses> }), [])

  // Wizard navigation
  const nav = usePsychiatryWizardNav({
    loading,
    completedSections: progress?.completedSections,
    lastPhase: intake?.lastPhase,
    get stepStatuses() { return navStepStatusesRef.current },
    persistCurrentStep: persistence.persistCurrentStep,
    updateIntake,
  })

  // Hydrate step data from canonical state
  const currentStepDraft = nav.currentStep
    ? (formData[(nav.currentStep as { id: string }).id] ?? {})
    : {}
  const currentStepData = useMemo(() => {
    if (!nav.currentStep) return {} as Record<string, AnamnesisFieldValue>
    return hydrateStepData(
      (nav.currentStep as { id: string }).id,
      currentStepDraft,
    ) as Record<string, AnamnesisFieldValue>
  }, [clinicalState, nav.currentStep, currentStepDraft, hydrateStepData])

  // Visible fields
  const visibleFields: AnamnesisField[] = useMemo(() => {
    if (!nav.currentStep || 'field' in (nav.currentStep as Record<string, unknown>)) return []
    const step = nav.currentStep as { fields: AnamnesisField[] }
    return computeVisibleFields(step.fields, currentStepData)
  }, [nav.currentStep, currentStepData])

  // Step statuses (derived from clinical state)
  const stepStatuses = useMemo(() => {
    if (!nav.currentPhase?.steps) return []
    return deriveStepStatuses(
      nav.currentPhase.steps as ReadonlyArray<{ id: string; fields?: Array<{ id: string }>; field?: { id: string } }>,
      getFieldUiState,
    )
  }, [nav.currentPhase?.steps, getFieldUiState])

  // Wire refs for persistence and nav (update before any callbacks can fire)
  persistenceCurrentStepRef.current = nav.currentStep
  persistenceStepDataRef.current = currentStepData
  persistenceVisibleFieldsRef.current = visibleFields as AnamnesisField[]
  navStepStatusesRef.current = stepStatuses

  // Voice context
  const currentVoiceContext = useMemo(() => {
    if (!nav.currentStep) return null
    const segment = STEP_TO_SEGMENT[(nav.currentStep as { id: string }).id]
    return segment ? getVoiceContext(segment) : null
  }, [nav.currentStep, getVoiceContext])

  // Field update (merges into form + clinical state)
  const updateField = useCallback((fieldId: string, value: AnamnesisFieldValue) => {
    if (!nav.currentStep) return
    const stepId = (nav.currentStep as { id: string }).id
    setFormData((prev) => ({
      ...prev,
      [stepId]: {
        ...(prev[stepId] ?? {}),
        [fieldId]: value,
      },
    }))
    persistence.setSaveError(null)

    const segment = STEP_TO_SEGMENT[stepId]
    if (segment) {
      mergeIntoClinicalState({ [fieldId]: value }, segment, {
        explicitConfirmation: false,
      })
    }
  }, [nav.currentStep, mergeIntoClinicalState, persistence])

  // Redo also resets nav
  const handleRedo = useCallback(async () => {
    const resetOk = await persistence.handleRedo()
    if (!resetOk) return

    const emptyFormData = buildFormData([], patientBirthDate)
    setFormData(emptyFormData)
    resetClinicalState(resolveWorkflowType(emptyFormData))
    nav.resetToStart()
  }, [nav, patientBirthDate, persistence, resetClinicalState])

  return {
    // Auth / loading
    authRequired,
    sessionLoading,
    loading,
    error,

    // Intake
    intake,
    formData,
    clinicalState,
    patient,

    // Navigation
    ...nav,
    stepStatuses,

    // Field data
    currentStepData,
    visibleFields,
    currentVoiceContext,

    // Field operations
    updateField,
    getCanonicalField,
    getFieldUiState,
    confirmField,

    // Voice
    mergeVoiceData,
    getPlannedQuestions,
    getPromptSnapshot,

    // Persistence / actions
    ...persistence,
    handleRedo,
  }
}
