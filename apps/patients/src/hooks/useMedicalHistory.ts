import type {
  MedicalHistorySummary,
  MedicalHistoryTimeline,
} from '@/types/medical-history'
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
    if (!supabase) {
      throw new Error('Supabase client not initialized')
    }

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
      await supabase
        .from('anamnesis')
        .select('*')
        .eq('patient_id', userId)
        .single()

      // Build summary from data
      const activeMedications = medicalRecords?.filter(r =>
        r.record_type === 'prescription' && r.status === 'active'
      ) || []

      const recentDiagnoses = medicalRecords?.filter(r =>
        r.record_type === 'diagnosis'
      ) || []

      const summaryData: MedicalHistorySummary = {
        patient_id: userId,
        active_conditions_count: recentDiagnoses.length,
        active_medications_count: activeMedications.length,
        known_allergies_count: 0, // Will be populated from anamnesis if available
        last_encounter_date: medicalRecords?.[0]?.created_at || new Date().toISOString(),
        chronic_conditions: recentDiagnoses.map(d => d.title),
        critical_allergies: [],
        current_medications: activeMedications.map(m => `${m.title} ${m.dosage || ''}`.trim())
      }

      // Build timeline
      const timelineData: MedicalHistoryTimeline = {
        patient_id: userId,
        sections: {
          conditions: recentDiagnoses.map(r => ({
            id: r.id,
            name: r.title,
            onset_date: r.created_at,
            created_at: r.created_at,
            status: 'active',
            severity: 'moderate',
            notes: r.notes || undefined
          })),
          allergies: [],
          medications: activeMedications.map(m => ({
            id: m.id,
            name: m.title,
            start_date: m.created_at,
            dosage: m.dosage || 'No especificado',
            frequency: m.frequency || 'Según indicación médica',
            status: 'active'
          })),
          procedures: medicalRecords?.filter(r => r.record_type === 'procedure').map(p => ({
            id: p.id,
            name: p.title,
            performed_date: p.created_at,
            indication: p.notes || undefined,
            outcome: p.outcome || undefined
          })) || [],
          encounters: medicalRecords?.filter(r => r.record_type === 'encounter' || r.record_type === 'note').map(e => ({
            id: e.id,
            created_at: e.created_at,
            reason: e.title,
            location: e.facility || undefined
          })) || [],
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
