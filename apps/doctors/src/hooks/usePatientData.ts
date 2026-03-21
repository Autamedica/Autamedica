/**
 * Hook para manejar datos de pacientes con integración Supabase
 */

import { getSupabaseClient } from '@autamedica/auth/client';
import { logger, toCamel } from '@autamedica/shared';
import type { PatientProfile, UUID } from '@autamedica/types';
import { useCallback, useEffect, useState } from 'react';

interface UsePatientDataResult {
  patient: PatientProfile | null;
  loading: boolean;
  error: string | null;
  refresh?: () => void;
}

export function usePatientData(patientId: UUID | null): UsePatientDataResult {
  const [patient, setPatient] = useState<PatientProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPatient = useCallback(async () => {
    if (!patientId) {
      setPatient(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Use the authenticated browser client (carries session JWT via cookies)
      // so RLS policies allow the doctor to read this patient's record.
      const supabase = getSupabaseClient()
      const { data, error: dbError } = await supabase
        .from('patients')
        .select('*')
        .eq('id', patientId)
        .maybeSingle()

      if (dbError) throw dbError

      if (data) {
        setPatient(toCamel(data) as unknown as PatientProfile)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error al cargar datos del paciente: ${errorMessage}`)
      logger.error('[usePatientData] Error:', err)
    } finally {
      setLoading(false)
    }
  }, [patientId])

  const refresh = async () => {
    await fetchPatient()
  }

  useEffect(() => {
    void fetchPatient()
  }, [fetchPatient])

  return {
    patient,
    loading,
    error,
    refresh
  }
}
