import { useCallback, useState } from 'react'
import { validateRequiredFields } from '@/lib/patients/usecases/anamnesis-flow.usecase'
import { psychiatryIntakePdfService } from '@/lib/patients/services/psychiatry-intake-pdf.service'
import type { SegmentKey } from '@/lib/patients/clinical-state/types'
import type { AnamnesisField, AnamnesisFieldValue } from '@/lib/patients/types/anamnesis'
import type { PsychiatryIntakePhase, PsychiatryIntakeSection } from '@/lib/patients/types/psychiatry-intake'

interface CurrentStepLike {
  id: string
  field?: AnamnesisField
  fields?: AnamnesisField[]
}

export interface UsePsychiatryPersistenceOptions {
  currentStep: CurrentStepLike | null
  currentStepData: Record<string, AnamnesisFieldValue>
  currentPhaseId: PsychiatryIntakePhase
  visibleFields: AnamnesisField[]
  updateSection: (
    section: PsychiatryIntakeSection,
    data: Record<string, AnamnesisFieldValue>,
    phase?: Exclude<PsychiatryIntakePhase, 'completed'>,
  ) => Promise<boolean>
  resetIntake: () => Promise<boolean>
  commitStepData: (
    stepId: string,
    data: Record<string, AnamnesisFieldValue>,
    segment?: SegmentKey,
  ) => void
  persistClinicalState: () => Promise<void>
}

export interface UsePsychiatryPersistenceReturn {
  persistCurrentStep: () => Promise<boolean>
  handleDownloadPdf: () => Promise<void>
  handleRedo: () => Promise<boolean>
  saving: boolean
  saveError: string | null
  setSaveError: (e: string | null) => void
  downloadingPdf: boolean
}

export function usePsychiatryPersistence(
  opts: UsePsychiatryPersistenceOptions,
): UsePsychiatryPersistenceReturn {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  const persistCurrentStep = useCallback(async (): Promise<boolean> => {
    const { currentStep, currentStepData, currentPhaseId, visibleFields, updateSection, commitStepData, persistClinicalState } = opts
    if (!currentStep) return false

    if (currentStep.field) {
      const fieldValue = currentStepData[currentStep.field.id]
      const missing = validateRequiredFields(currentStepData, [currentStep.field])
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
      const phase = currentPhaseId === 'completed' ? undefined : currentPhaseId
      const saved = await updateSection(
        currentStep.id as PsychiatryIntakeSection,
        currentStepData,
        phase,
      )
      if (saved) {
        commitStepData(currentStep.id, currentStepData)
        await persistClinicalState()
      }
      return saved
    } finally {
      setSaving(false)
    }
  }, [opts])

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
      setSaveError(null)
      return await opts.resetIntake()
    } finally {
      setSaving(false)
    }
  }, [opts])

  return {
    persistCurrentStep,
    handleDownloadPdf,
    handleRedo,
    saving,
    saveError,
    setSaveError,
    downloadingPdf,
  }
}
