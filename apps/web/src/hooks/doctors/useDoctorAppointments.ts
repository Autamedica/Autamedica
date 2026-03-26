/**
 * Web-only appointments hook.
 * Keeps agenda hydration independent from the shared hooks package entrypoint.
 */
import { useCallback, useEffect, useState } from 'react'
import { logger } from '@autamedica/shared'
import type { Appointment } from '@autamedica/types'
import { getBrowserSupabaseClient } from '@/lib/supabase-browser'

interface UseDoctorAppointmentsResult {
  appointments: Appointment[]
  loading: boolean
  error: string | null
  isClientReady: boolean
  refetch: () => Promise<void>
}

export function useDoctorAppointments(doctorId?: string): UseDoctorAppointmentsResult {
  const [supabaseClient, setSupabaseClient] = useState<ReturnType<typeof getBrowserSupabaseClient> | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSupabaseClient(getBrowserSupabaseClient())
  }, [])

  const refetch = useCallback(async (): Promise<void> => {
    if (!supabaseClient) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      let query = supabaseClient
        .from('appointments')
        .select('*')
        .order('start_time', { ascending: true })

      if (doctorId) {
        query = query.eq('doctor_id', doctorId)
      }

      const { data, error: fetchError } = await query
      if (fetchError) {
        throw fetchError
      }

      setAppointments((data ?? []) as Appointment[])
    } catch (err) {
      logger.error('[useDoctorAppointments] fetch error:', err)
      setError(err instanceof Error ? err.message : 'Error al cargar citas')
    } finally {
      setLoading(false)
    }
  }, [doctorId, supabaseClient])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return {
    appointments,
    loading,
    error,
    isClientReady: supabaseClient !== null,
    refetch,
  }
}
