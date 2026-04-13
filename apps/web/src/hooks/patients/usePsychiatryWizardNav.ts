import { useCallback, useEffect, useRef, useState } from 'react'
import {
  psychiatryPhaseMeta,
  psychiatryPhaseOrder,
} from '@/lib/patients/data/psychiatry-intake-steps'
import { getPhaseStart } from '@/lib/patients/usecases/psychiatry-intake-flow.usecase'
import type { PsychiatryIntakePhase } from '@/lib/patients/types/psychiatry-intake'
import type { StepStatus } from '@/lib/patients/usecases/psychiatry-intake-flow.usecase'

export interface UsePsychiatryWizardNavOptions {
  loading: boolean
  completedSections: string[] | undefined
  lastPhase: PsychiatryIntakePhase | null | undefined
  stepStatuses: StepStatus[]
  persistCurrentStep: () => Promise<boolean>
  updateIntake: (data: Record<string, unknown>) => Promise<boolean>
}

export interface UsePsychiatryWizardNavReturn {
  phaseIndex: number
  stepIndex: number
  currentPhaseId: PsychiatryIntakePhase
  currentPhase: (typeof psychiatryPhaseMeta)[keyof typeof psychiatryPhaseMeta]
  currentStep: unknown
  isCompletedView: boolean
  voiceMode: boolean
  setVoiceMode: (v: boolean) => void
  handleNext: () => Promise<void>
  handlePrev: () => void
  resetToStart: () => void
}

export function usePsychiatryWizardNav(
  opts: UsePsychiatryWizardNavOptions,
): UsePsychiatryWizardNavReturn {
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [stepIndex, setStepIndex] = useState(0)
  const [voiceMode, setVoiceMode] = useState(false)
  const initializedRef = useRef(false)

  // Initialize position from saved progress
  useEffect(() => {
    if (opts.loading || initializedRef.current) return
    initializedRef.current = true
    const start = getPhaseStart(opts.completedSections, opts.lastPhase)
    setPhaseIndex(start.phaseIndex)
    setStepIndex(start.stepIndex)
  }, [opts.loading, opts.completedSections, opts.lastPhase])

  const currentPhaseId = psychiatryPhaseOrder[phaseIndex] ?? 'wizard_intake'
  const currentPhase = psychiatryPhaseMeta[currentPhaseId]
  const isCompletedView = currentPhaseId === 'completed'
  const currentStep = !isCompletedView
    ? (currentPhase.steps[stepIndex] ?? currentPhase.steps[0] ?? null)
    : null

  const moveToPhase = useCallback(async (nextPhaseId: PsychiatryIntakePhase) => {
    const nextPhaseIndex = psychiatryPhaseOrder.indexOf(nextPhaseId)
    if (nextPhaseIndex < 0) return

    setPhaseIndex(nextPhaseIndex)
    setStepIndex(0)
    setVoiceMode(false)
    await opts.updateIntake({
      lastPhase: nextPhaseId,
      privacyAccepted: true,
      termsAccepted: true,
    })
  }, [opts])

  const handleNext = useCallback(async () => {
    const saved = await opts.persistCurrentStep()
    if (!saved) return

    const phaseSteps = currentPhase.steps
    if (stepIndex < phaseSteps.length - 1) {
      let nextIdx = stepIndex + 1
      while (nextIdx < phaseSteps.length - 1 && opts.stepStatuses[nextIdx] === 'locked') {
        nextIdx++
      }
      setStepIndex(nextIdx)
      setVoiceMode(false)
      return
    }

    const nextPhaseId = psychiatryPhaseOrder[phaseIndex + 1] ?? 'completed'
    if (nextPhaseId === 'completed') {
      await opts.updateIntake({
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
  }, [currentPhase.steps, moveToPhase, opts, phaseIndex, stepIndex])

  const handlePrev = useCallback(() => {
    if (stepIndex > 0) {
      setStepIndex((prev) => prev - 1)
      setVoiceMode(false)
      return
    }

    if (phaseIndex > 0) {
      const previousPhaseIndex = phaseIndex - 1
      const previousPhaseId = psychiatryPhaseOrder[previousPhaseIndex]
      if (previousPhaseId === 'completed') return
      const previousPhase = psychiatryPhaseMeta[previousPhaseId]
      setPhaseIndex(previousPhaseIndex)
      setStepIndex(Math.max(previousPhase.steps.length - 1, 0))
      setVoiceMode(false)
    }
  }, [phaseIndex, stepIndex])

  const resetToStart = useCallback(() => {
    setPhaseIndex(0)
    setStepIndex(0)
    setVoiceMode(false)
  }, [])

  return {
    phaseIndex,
    stepIndex,
    currentPhaseId,
    currentPhase,
    currentStep,
    isCompletedView,
    voiceMode,
    setVoiceMode,
    handleNext,
    handlePrev,
    resetToStart,
  }
}
