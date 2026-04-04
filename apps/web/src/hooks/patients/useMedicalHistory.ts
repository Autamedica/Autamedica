import type {
  MedicalHistorySummary,
  MedicalHistoryTimeline,
  PatientPrescription,
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
  const [prescriptions, setPrescriptions] = useState<PatientPrescription[]>([])
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

      const rawMeds = (data.summary.medications ?? []) as Array<{ id: unknown; title: unknown; content: unknown; created_at: unknown }>
      setPrescriptions(rawMeds.map((r) => {
        const c: Record<string, unknown> = (r.content && typeof r.content === 'object' && !Array.isArray(r.content))
          ? r.content as Record<string, unknown>
          : {}
        const fallback = typeof r.created_at === 'string' ? r.created_at : new Date().toISOString()
        return {
          id: String(r.id ?? ''),
          medication_name: typeof c.medication_name === 'string'
            ? c.medication_name
            : String(r.title ?? '').replace(/^Prescripci[oó]n:\s*/i, '') || 'Prescripción médica',
          dosage: typeof c.dosage === 'string' ? c.dosage : '',
          frequency: typeof c.frequency === 'string' ? c.frequency : '',
          duration: typeof c.duration === 'string' ? c.duration : '',
          instructions: typeof c.instructions === 'string' ? c.instructions : '',
          notes: typeof c.notes === 'string' ? c.notes : null,
          status: typeof c.status === 'string' ? c.status : 'activa',
          prescribed_date: typeof c.prescribed_date === 'string' ? c.prescribed_date : fallback,
          start_date: typeof c.start_date === 'string' ? c.start_date : fallback,
          end_date: typeof c.end_date === 'string' ? c.end_date : null,
          side_effects_warning: typeof c.side_effects_warning === 'string' ? c.side_effects_warning : null,
        }
      }))
    } catch (err) {
      logger.error('Error fetching medical history:', err)
      setError(err instanceof Error ? err.message : 'Error loading medical history')
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError(null)

        const data = await fetchApi<MedicalHistoryApiResponse>('/api/patients/medical-history')
        if (cancelled) return

        const allRecords = [
          ...(data.summary.medications ?? []),
          ...(data.summary.conditions ?? []),
          ...(data.summary.allergies ?? []),
        ] as Parameters<typeof buildMedicalHistorySummary>[1]

        const timelineRecords = (data.timeline ?? []) as Parameters<typeof buildMedicalHistoryTimeline>[1]

        const effectivePatientId = (patientId ?? '') as import('@autamedica/types').PatientId
        setSummary(buildMedicalHistorySummary(effectivePatientId, allRecords))
        setTimeline(buildMedicalHistoryTimeline(effectivePatientId, timelineRecords))

        const rawMeds = (data.summary.medications ?? []) as Array<{ id: unknown; title: unknown; content: unknown; created_at: unknown }>
        setPrescriptions(rawMeds.map((r) => {
          const c: Record<string, unknown> = (r.content && typeof r.content === 'object' && !Array.isArray(r.content))
            ? r.content as Record<string, unknown>
            : {}
          const fallback = typeof r.created_at === 'string' ? r.created_at : new Date().toISOString()
          return {
            id: String(r.id ?? ''),
            medication_name: typeof c.medication_name === 'string'
              ? c.medication_name
              : String(r.title ?? '').replace(/^Prescripci[oó]n:\s*/i, '') || 'Prescripción médica',
            dosage: typeof c.dosage === 'string' ? c.dosage : '',
            frequency: typeof c.frequency === 'string' ? c.frequency : '',
            duration: typeof c.duration === 'string' ? c.duration : '',
            instructions: typeof c.instructions === 'string' ? c.instructions : '',
            notes: typeof c.notes === 'string' ? c.notes : null,
            status: typeof c.status === 'string' ? c.status : 'activa',
            prescribed_date: typeof c.prescribed_date === 'string' ? c.prescribed_date : fallback,
            start_date: typeof c.start_date === 'string' ? c.start_date : fallback,
            end_date: typeof c.end_date === 'string' ? c.end_date : null,
            side_effects_warning: typeof c.side_effects_warning === 'string' ? c.side_effects_warning : null,
          }
        }))
      } catch (err) {
        if (cancelled) return
        logger.error('Error fetching medical history:', err)
        setError(err instanceof Error ? err.message : 'Error loading medical history')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [patientId])

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
    prescriptions,
    loading,
    error,
    refresh: fetchMedicalHistory,
    addCondition,
    addMedication,
    addAllergy,
  }
}
