/**
 * Hook para signos vitales — usa createBrowserClient directamente
 * (selectActive de @autamedica/shared usa process.env, no funciona en browser)
 */

import { useEffect, useState, useCallback } from 'react'
import { createBrowserClient } from '@autamedica/auth'
import { logger } from '@autamedica/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  VitalSigns,
  UseVitalSignsResult,
  UUID
} from '@/types/medical'

export function useVitalSigns(patientId: UUID | null): UseVitalSignsResult {
  const [vitalSigns, setVitalSigns] = useState<VitalSigns[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [latest, setLatest] = useState<VitalSigns | null>(null)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => { setIsClient(true) }, [])

  const fetchVitalSigns = useCallback(async () => {
    if (!patientId || !isClient) {
      setVitalSigns([])
      setLatest(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Cast to untyped client: avoids "type instantiation excessively deep"
      // caused by chaining .eq().order() against the 50-table Database schema.
      // Results are explicitly cast to VitalSigns[] below.
      const supabase = createBrowserClient() as SupabaseClient
      const { data, error: fetchError } = await supabase
        .from('vital_signs')
        .select('*')
        .eq('patient_id', patientId)
        .eq('active', true)
        .order('recorded_at', { ascending: false })

      if (fetchError) throw fetchError

      const results = (data ?? []) as unknown as VitalSigns[]
      setVitalSigns(results)
      setLatest(results.length > 0 ? results[0] : null)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error al cargar signos vitales: ${errorMessage}`)
      logger.error('[useVitalSigns] Error:', err instanceof Error ? err.message : err)
    } finally {
      setLoading(false)
    }
  }, [patientId, isClient])

  const addVitalSigns = useCallback(async (
    vitals: Omit<VitalSigns, 'id' | 'created_at'>
  ): Promise<void> => {
    if (!patientId) throw new Error('ID de paciente requerido')

    try {
      let bmi = vitals.bmi
      if (vitals.weight && vitals.height && !bmi) {
        const heightInMeters = vitals.height / 100
        bmi = Number((vitals.weight / (heightInMeters * heightInMeters)).toFixed(1))
      }

      const supabase = createBrowserClient() as SupabaseClient
      const { data, error: insertError } = await supabase
        .from('vital_signs')
        .insert({ ...vitals, patient_id: patientId, bmi })
        .select()
        .single()

      if (insertError) throw insertError

      const newVital = data as unknown as VitalSigns
      setVitalSigns(prev => [newVital, ...prev])
      setLatest(newVital)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error desconocido'
      setError(`Error al agregar signos vitales: ${errorMessage}`)
      logger.error('[useVitalSigns] addVitalSigns error:', err instanceof Error ? err.message : err)
      throw err
    }
  }, [patientId])

  useEffect(() => {
    fetchVitalSigns()
  }, [fetchVitalSigns])

  return {
    vitalSigns,
    loading,
    error,
    addVitalSigns,
    latest
  }
}
