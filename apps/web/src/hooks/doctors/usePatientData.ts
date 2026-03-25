/**
 * Hook: Specific patient detail state.
 * Consumes patientService to centralize DB access.
 * Only manages React state for a single patient profile.
 */
'use client'

import { useCallback, useEffect, useState } from 'react'
import { logger } from '@autamedica/shared'
import { patientService } from '@/lib/doctors/services/patient.service'
import type { PatientProfile, UUID } from '@autamedica/types'

interface UsePatientDataResult {
  patient: PatientProfile | null
  loading: boolean
  error: string | null
  refresh?: () => Promise<void>
}

export function usePatientData(patientId: UUID | null): UsePatientDataResult {
  const [patient, setPatient] = useState<PatientProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => setIsClient(true), [])

  const fetchPatient = useCallback(async (): Promise<void> => {
    if (!patientId || !isClient) {
      setPatient(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const data = await patientService.getPatientById(patientId)
      setPatient(data as unknown as PatientProfile)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error al cargar datos del paciente: ${message}`)
      logger.error('[usePatientData] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [patientId, isClient])

  useEffect(() => {
    void fetchPatient()
  }, [fetchPatient])

  return {
    patient,
    loading,
    error,
    refresh: fetchPatient,
  }
}
