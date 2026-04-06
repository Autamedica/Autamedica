'use client'

import { useState, useEffect, useCallback } from 'react'
import { getDoctorStats, type DoctorStats } from '@/lib/doctors/services/doctor-stats.service'
import { logger } from '@autamedica/shared'

interface UseDoctorStatsReturn {
  stats: DoctorStats | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * Controller de estadísticas del médico.
 *
 * Gestiona estado React y ciclo de vida (polling cada 60s).
 * Lógica de negocio y queries delegadas a DoctorStatsService.
 *
 * Capas: Component → useDoctorStats (controller) → DoctorStatsService → Supabase
 */
export function useDoctorStats(doctorId?: string, userId?: string): UseDoctorStatsReturn {
  const [stats, setStats] = useState<DoctorStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    if (!doctorId) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const data = await getDoctorStats(doctorId, userId)
      setStats(data)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error loading stats'
      setError(errorMessage)
      logger.error('Error in useDoctorStats:', err)
    } finally {
      setLoading(false)
    }
  }, [doctorId, userId])

  useEffect(() => {
    if (!doctorId) return

    void fetchStats()

    const interval = setInterval(() => void fetchStats(), 60000)
    return () => clearInterval(interval)
  }, [doctorId, fetchStats])

  return { stats, loading, error, refresh: fetchStats }
}
