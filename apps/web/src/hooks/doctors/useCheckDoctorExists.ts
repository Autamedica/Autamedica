/**
 * Hook: Check if current doctor profile exists in the database.
 * Used to determine onboarding state after authentication.
 * Layer 2 of the 7-layer architecture (React state management).
 */
'use client'

import { useCallback, useEffect, useState } from 'react'
import { doctorService } from '@/lib/doctors/services/doctor.service'
import { logger } from '@autamedica/shared'

interface UseCheckDoctorExistsResult {
  exists: boolean | null
  loading: boolean
}

export function useCheckDoctorExists(userId: string | undefined): UseCheckDoctorExistsResult {
  const [exists, setExists] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  const checkExists = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const doctor = await doctorService.getDoctorByUserId(userId)
      setExists(!!doctor)
    } catch (err) {
      logger.error('[useCheckDoctorExists] error:', err)
      setExists(false)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void checkExists()
  }, [checkExists])

  return { exists, loading }
}
