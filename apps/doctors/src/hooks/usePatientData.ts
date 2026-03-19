/**
 * Hook para manejar datos de pacientes con integración Supabase
 */

import { logger, selectById } from '@autamedica/shared';
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
      // patients no implementa soft-delete; el helper genérico debe leerla sin filtro deleted_at
      const data = await selectById<'patients', PatientProfile>('patients', patientId, {
        includeDeleted: true,
      });

      if (data) {
        setPatient(data)
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
