import type {
  MedicalHistorySummary,
  MedicalHistoryTimeline,
} from '@/lib/patients/types/medical-history'
import { useSupabase } from '@autamedica/auth/react'
import { logger } from '@autamedica/shared'
import type { PatientId } from '@autamedica/types'
import { useCallback, useEffect, useState } from 'react'

export function useMedicalHistory(patientId?: PatientId) {
  const supabase = useSupabase()
  const [summary, setSummary] = useState<MedicalHistorySummary | null>(null)
  const [timeline, setTimeline] = useState<MedicalHistoryTimeline | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMedicalHistory = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Get current user session
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('No authenticated user found')
      }

      const userId = patientId || (user.id as PatientId)

      // Fetch medical records
      const { data: medicalRecords, error: recordsError } = await supabase
        .from('medical_records')
        .select('*')
        .eq('patient_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (recordsError) throw recordsError

      // Fetch from anamnesis table for chronic conditions and allergies
      const { data: _anamnesisData } = await supabase
        .from('anamnesis')
        .select('*')
        .eq('patient_id', userId)
        .single()

      const records = (medicalRecords ?? []) as Array<Record<string, unknown>>

      const getContent = (record: Record<string, unknown>): Record<string, unknown> => {
        const content = record.content
        return content && typeof content === 'object' && !Array.isArray(content)
          ? content as Record<string, unknown>
          : {}
      }

      const getType = (record: Record<string, unknown>): string => {
        return typeof record.type === 'string' ? record.type : ''
      }

      const getStatus = (record: Record<string, unknown>): string | null => {
        const content = getContent(record)
        return typeof content.status === 'string' ? content.status : null
      }

      const isActiveMedication = (record: Record<string, unknown>): boolean => {
        if (getType(record) !== 'prescription') return false

        const status = getStatus(record)
        if (status === 'active' || status === 'activa') return true
        if (status === 'completed' || status === 'completada' || status === 'cancelled' || status === 'cancelada') {
          return false
        }

        const content = getContent(record)
        const endDate = typeof content.end_date === 'string' ? content.end_date : null
        return !endDate || new Date(endDate) >= new Date()
      }

      const activeMedications = records.filter(isActiveMedication)
      const recentDiagnoses = records.filter((record) => getType(record) === 'diagnosis')

      const summaryData: MedicalHistorySummary = {
        patient_id: userId,
        active_conditions_count: recentDiagnoses.length,
        active_medications_count: activeMedications.length,
        known_allergies_count: 0, // Will be populated from anamnesis if available
        last_encounter_date: typeof records[0]?.created_at === 'string' ? records[0].created_at : new Date().toISOString(),
        chronic_conditions: recentDiagnoses.map((record) => String(record.title || 'Diagnóstico')),
        critical_allergies: [],
        current_medications: activeMedications.map((record) => {
          const content = getContent(record)
          const medicationName = typeof content.medication_name === 'string' ? content.medication_name : String(record.title || 'Medicamento')
          const dosage = typeof content.dosage === 'string' ? content.dosage : ''
          return `${medicationName} ${dosage}`.trim()
        })
      }

      // Build timeline
      const timelineData: MedicalHistoryTimeline = {
        patient_id: userId,
        sections: {
          conditions: recentDiagnoses.map((record) => ({
            id: String(record.id),
            name: String(record.title || 'Diagnóstico'),
            onset_date: typeof record.created_at === 'string' ? record.created_at : new Date().toISOString(),
            created_at: typeof record.created_at === 'string' ? record.created_at : new Date().toISOString(),
            status: 'active',
            severity: 'moderate',
            notes: typeof getContent(record).notes === 'string' ? String(getContent(record).notes) : undefined
          })),
          allergies: [],
          medications: activeMedications.map((record) => {
            const content = getContent(record)
            return {
              id: String(record.id),
              name: typeof content.medication_name === 'string' ? content.medication_name : String(record.title || 'Medicamento'),
              start_date: typeof record.created_at === 'string' ? record.created_at : new Date().toISOString(),
              dosage: typeof content.dosage === 'string' ? content.dosage : 'No especificado',
              frequency: typeof content.frequency === 'string' ? content.frequency : 'Según indicación médica',
              status: 'active'
            }
          }),
          procedures: records.filter((record) => getType(record) === 'procedure').map((record) => {
            const content = getContent(record)
            return {
              id: String(record.id),
              name: String(record.title || 'Procedimiento'),
              performed_date: typeof record.created_at === 'string' ? record.created_at : new Date().toISOString(),
              indication: typeof content.notes === 'string' ? content.notes : undefined,
              outcome: typeof content.outcome === 'string' ? content.outcome : undefined
            }
          }),
          encounters: records.filter((record) => {
            const type = getType(record)
            return type === 'encounter' || type === 'note' || type === 'consultation'
          }).map((record) => {
            const content = getContent(record)
            return {
              id: String(record.id),
              created_at: typeof record.created_at === 'string' ? record.created_at : new Date().toISOString(),
              reason: String(record.title || 'Consulta'),
              location: typeof content.facility === 'string' ? content.facility : undefined
            }
          }),
          immunizations: []
        }
      }

      setSummary(summaryData)
      setTimeline(timelineData)

    } catch (err) {
      logger.error('Error fetching medical history:', err)
      setError(err instanceof Error ? err.message : 'Error loading medical history')
    } finally {
      setLoading(false)
    }
  }, [supabase, patientId])

  useEffect(() => {
    fetchMedicalHistory()
  }, [fetchMedicalHistory])

  const addCondition = async (condition: { condition: string; icd10_code?: string; notes?: string }) => {
    try {
      const res = await fetch('/api/patients/medical-history/conditions', {
        method: 'POST',
        credentials: 'include',
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
      const res = await fetch('/api/patients/medical-history/medications', {
        method: 'POST',
        credentials: 'include',
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
      const res = await fetch('/api/patients/medical-history/allergies', {
        method: 'POST',
        credentials: 'include',
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
