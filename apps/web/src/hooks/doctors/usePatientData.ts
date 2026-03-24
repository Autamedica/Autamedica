/**
 * Hook para manejar datos de pacientes con integración Supabase
 */

import { logger } from '@autamedica/shared';
import { createBrowserClient } from '@autamedica/auth/client';
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
  const [isClient, setIsClient] = useState(false)

  useEffect(() => { setIsClient(true) }, [])

  const fetchPatient = useCallback(async () => {
    if (!patientId || !isClient) {
      setPatient(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const supabase = createBrowserClient()
      const { data, error: fetchError } = await supabase
        .from('patients')
        .select(`
          id,
          user_id,
          dni,
          birth_date,
          gender,
          blood_type,
          active,
          created_at,
          updated_at,
          profile:profiles!inner(
            first_name,
            last_name,
            email,
            phone,
            avatar_url
          )
        `)
        .eq('id', patientId)
        .maybeSingle()

      if (fetchError) throw fetchError

      setPatient(data as unknown as PatientProfile)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error al cargar datos del paciente: ${errorMessage}`)
      logger.error('[usePatientData] Error:', err instanceof Error ? err.message : err)
    } finally {
      setLoading(false)
    }
  }, [patientId, isClient])

  useEffect(() => {
    fetchPatient()
  }, [fetchPatient])

  return {
    patient,
    loading,
    error,
    refresh: fetchPatient
  }
}
