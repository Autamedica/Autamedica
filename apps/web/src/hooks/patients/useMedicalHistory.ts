import type {
  MedicalHistorySummary,
  MedicalHistoryTimeline,
} from '@/lib/patients/types/medical-history'
import { fetchApi } from '@/lib/api-client'
import { buildMedicalHistorySummary, buildMedicalHistoryTimeline } from '@/lib/patients/services/medical-history.frontend'
import { logger } from '@autamedica/shared'
import { useCallback, useEffect, useState } from 'react'

interface MedicalHistoryApiResponse {
  summary: {
    medications: unknown[]
    conditions: unknown[]
    allergies: unknown[]
  }
  timeline: unknown[]
  anamnesis: unknown[]
}

export function useMedicalHistory(patientId?: string) {
  const [summary, setSummary] = useState<MedicalHistorySummary | null>(null)
  const [timeline, setTimeline] = useState<MedicalHistoryTimeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMedicalHistory = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const data = await fetchApi<MedicalHistoryApiResponse>('/api/patients/medical-history')

      // Build typed UI models from raw API records
      const allRecords = [
        ...(data.summary.medications ?? []),
        ...(data.summary.conditions ?? []),
        ...(data.summary.allergies ?? []),
      ] as Parameters<typeof buildMedicalHistorySummary>[1]

      const timelineRecords = (data.timeline ?? []) as Parameters<typeof buildMedicalHistoryTimeline>[1]

      const effectivePatientId = (patientId ?? '') as import('@autamedica/types').PatientId
      setSummary(buildMedicalHistorySummary(effectivePatientId, allRecords))
      setTimeline(buildMedicalHistoryTimeline(effectivePatientId, timelineRecords))
    } catch (err) {
      logger.error('Error fetching medical history:', err)
      setError(err instanceof Error ? err.message : 'Error loading medical history')
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    fetchMedicalHistory()
  }, [fetchMedicalHistory])

  const addCondition = async (condition: { condition: string; icd10_code?: string; notes?: string }) => {
    try {
      await fetchApi('/api/patients/medical-history/conditions', {
        body: { name: condition.condition, notes: condition.notes },
      })
      await fetchMedicalHistory()
    } catch (err) {
      logger.error('Error adding condition:', err)
      setError('Error adding medical condition')
    }
  }

  const addMedication = async (medication: {
    medication_name: string
    dosage?: string
    frequency?: string
    route?: string
    reason?: string
    end_date?: string | null
  }) => {
    try {
      await fetchApi('/api/patients/medical-history/medications', {
        body: {
          name: medication.medication_name,
          dosage: medication.dosage,
          frequency: medication.frequency,
          notes: medication.reason,
        },
      })
      await fetchMedicalHistory()
    } catch (err) {
      logger.error('Error adding medication:', err)
      setError('Error adding medication')
    }
  }

  const addAllergy = async (allergy: {
    allergen: string
    type?: string
    severity?: string
    reaction?: string
    notes?: string
  }) => {
    try {
      await fetchApi('/api/patients/medical-history/allergies', {
        body: {
          name: allergy.allergen,
          severity: allergy.severity,
          reaction: allergy.reaction,
          notes: allergy.notes,
        },
      })
      await fetchMedicalHistory()
    } catch (err) {
      logger.error('Error adding allergy:', err)
      setError('Error adding allergy')
    }
  }

  return {
    summary,
    timeline,
    loading,
    error,
    refresh: fetchMedicalHistory,
    addCondition,
    addMedication,
    addAllergy,
  }
}
