import type {
  MedicalHistorySummary,
  MedicalHistoryTimeline,
} from '@/types/medical-history'
import { logger } from '@autamedica/shared'
import type { PatientId } from '@autamedica/types'
import { useCallback, useEffect, useState } from 'react'

export function useMedicalHistory(patientId?: PatientId) {
  const [summary, setSummary] = useState<MedicalHistorySummary | null>(null)
  const [timeline, setTimeline] = useState<MedicalHistoryTimeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMedicalHistory = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const params = patientId ? `?patientId=${encodeURIComponent(patientId)}` : ''
      const response = await fetch(`/api/medical-history${params}`, { cache: 'no-store' })
      const result = await response.json().catch(() => ({}))

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Error loading medical history')
      }

      setSummary((result.data?.summary as MedicalHistorySummary | null) ?? null)
      setTimeline((result.data?.timeline as MedicalHistoryTimeline | null) ?? null)
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
      const res = await fetch('/api/medical-history/conditions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          condition: condition.condition,
          icd10_code: condition.icd10_code,
          notes: condition.notes,
        }),
      })
      if (!res.ok) throw new Error('Failed to add condition')
      await fetchMedicalHistory()
    } catch (error) {
      logger.error('Error adding condition:', error)
      setError('Error adding medical condition')
    }
  }

  const addMedication = async (medication: { medication_name: string; dosage?: string; frequency?: string; route?: string; reason?: string; end_date?: string | null }) => {
    try {
      const res = await fetch('/api/medical-history/medications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medication_name: medication.medication_name,
          dosage: medication.dosage,
          frequency: medication.frequency,
          route: medication.route,
          reason: medication.reason,
          end_date: medication.end_date ?? null,
        }),
      })
      if (!res.ok) throw new Error('Failed to add medication')
      await fetchMedicalHistory()
    } catch (error) {
      logger.error('Error adding medication:', error)
      setError('Error adding medication')
    }
  }

  const addAllergy = async (allergy: { allergen: string; type?: string; severity?: string; reaction?: string; notes?: string }) => {
    try {
      const res = await fetch('/api/medical-history/allergies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allergen: allergy.allergen,
          type: allergy.type,
          severity: allergy.severity,
          reaction: allergy.reaction,
          notes: allergy.notes,
        }),
      })
      if (!res.ok) throw new Error('Failed to add allergy')
      await fetchMedicalHistory()
    } catch (error) {
      logger.error('Error adding allergy:', error)
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
    addAllergy
  }
}
