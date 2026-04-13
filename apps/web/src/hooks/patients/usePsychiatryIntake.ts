'use client'

import { useCallback, useEffect, useState } from 'react'
import { logger } from '@autamedica/shared'
import { ApiError, fetchApi } from '@/lib/api-client'
import type {
  PsychiatryIntakePhase,
  PsychiatryIntakeRecord,
  PsychiatryIntakeProgress,
  PsychiatryIntakeSection,
  PsychiatryIntakeSectionRecord,
} from '@/lib/patients/types/psychiatry-intake'
import type { AnamnesisFieldValue } from '@/lib/patients/types/anamnesis'

interface ApiResponse {
  intake: PsychiatryIntakeRecord
  sections: PsychiatryIntakeSectionRecord[]
  progress: PsychiatryIntakeProgress
  patientBirthDate?: string | null
}

interface UsePsychiatryIntakeReturn {
  intake: PsychiatryIntakeRecord | null
  sections: PsychiatryIntakeSectionRecord[]
  progress: PsychiatryIntakeProgress | null
  patientBirthDate: string | null
  loading: boolean
  error: string | null
  authRequired: boolean
  updateIntake: (updates: Partial<PsychiatryIntakeRecord>) => Promise<boolean>
  updateSection: (
    section: PsychiatryIntakeSection,
    data: Record<string, AnamnesisFieldValue>,
    phase?: Exclude<PsychiatryIntakePhase, 'completed'>,
  ) => Promise<boolean>
  resetIntake: () => Promise<boolean>
  refresh: () => Promise<void>
}

export function usePsychiatryIntake(): UsePsychiatryIntakeReturn {
  const [intake, setIntake] = useState<PsychiatryIntakeRecord | null>(null)
  const [sections, setSections] = useState<PsychiatryIntakeSectionRecord[]>([])
  const [progress, setProgress] = useState<PsychiatryIntakeProgress | null>(null)
  const [patientBirthDate, setPatientBirthDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [authRequired, setAuthRequired] = useState(false)

  const handleApiError = useCallback((err: unknown, fallbackMessage: string): string => {
    if (err instanceof ApiError && err.status === 401) {
      setAuthRequired(true)
      setError('unauthorized')
      return 'unauthorized'
    }

    const message = err instanceof ApiError ? err.message : fallbackMessage
    setError(message)
    return message
  }, [])

  const fetchIntake = useCallback(async (): Promise<ApiResponse | null> => {
    try {
      setLoading(true)
      setError(null)
      setAuthRequired(false)
      const data = await fetchApi<ApiResponse>('/api/patients/psychiatry-intake')
      setIntake(data.intake)
      setSections(data.sections)
      setProgress(data.progress)
      setPatientBirthDate(data.patientBirthDate ?? null)
      return data
    } catch (err) {
      logger.error('Error fetching psychiatry intake:', err)
      handleApiError(err, 'Error desconocido')
      return null
    } finally {
      setLoading(false)
    }
  }, [handleApiError])

  const updateIntake = useCallback(async (updates: Partial<PsychiatryIntakeRecord>): Promise<boolean> => {
    try {
      await fetchApi('/api/patients/psychiatry-intake', {
        method: 'PATCH',
        body: updates,
      })
      await fetchIntake()
      return true
    } catch (err) {
      logger.error('Error updating psychiatry intake:', err)
      handleApiError(err, 'Error al actualizar evaluación psiquiátrica')
      return false
    }
  }, [fetchIntake, handleApiError])

  const updateSection = useCallback(async (
    section: PsychiatryIntakeSection,
    data: Record<string, AnamnesisFieldValue>,
    phase?: Exclude<PsychiatryIntakePhase, 'completed'>,
  ): Promise<boolean> => {
    try {
      const result = await fetchApi<{ progress?: PsychiatryIntakeProgress }>('/api/patients/psychiatry-intake', {
        method: 'POST',
        body: { stepId: section, phase, data, completed: true },
      })
      if (result?.progress) {
        setProgress(result.progress)
      }
      await fetchIntake()
      return true
    } catch (err) {
      logger.error('Error updating psychiatry intake section:', err)
      handleApiError(err, 'Error al guardar sección psiquiátrica')
      return false
    }
  }, [fetchIntake, handleApiError])

  const resetIntake = useCallback(async (): Promise<boolean> => {
    try {
      await fetchApi('/api/patients/psychiatry-intake', {
        method: 'DELETE',
      })
      await fetchIntake()
      return true
    } catch (err) {
      logger.error('Error resetting psychiatry intake:', err)
      handleApiError(err, 'Error al reiniciar la evaluación psiquiátrica')
      return false
    }
  }, [fetchIntake, handleApiError])

  const refresh = useCallback(async () => {
    await fetchIntake()
  }, [fetchIntake])

  useEffect(() => {
    fetchIntake()
  }, [fetchIntake])

  return {
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
    refresh,
  }
}
