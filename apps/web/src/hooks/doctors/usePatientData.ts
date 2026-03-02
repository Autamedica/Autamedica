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

  const _calculateAge = (dateOfBirth: string): number => {
    const birth = new Date(dateOfBirth)
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--
    }

    return age
  }

  const fetchPatient = useCallback(async () => {
    if (!patientId) {
      setPatient(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Sistema híbrido: fetch from 'patients' joining 'profiles'
      const data = await selectById<'patients', any>('patients', patientId, {
        // Query string includes the relationship
        // In the database.types.ts we have foreign keys defined
      });

      if (data) {
        // Transformar para el formato que espera PatientProfile if needed
        // but here we align with the schema
        setPatient(data as unknown as PatientProfile)
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
    fetchPatient()
  }, [patientId])

  return {
    patient,
    loading,
    error,
    refresh
  }
}