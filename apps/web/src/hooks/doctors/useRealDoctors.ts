/**
 * Hooks: Doctor UI State.
 * Consumes doctorService for all business logic and DB access.
 * Only manages React state (loading, error, data) + event coordination.
 */
'use client'

import { useCallback, useEffect, useState } from 'react'
import { logger } from '@autamedica/shared'
import { doctorService } from '@/lib/doctors/services/doctor.service'
import type { DoctorWithProfile } from '@autamedica/types'

// ─── useCurrentDoctor ────────────────────────────────────────────────────────

interface UseCurrentDoctorResult {
  doctor: DoctorWithProfile | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useCurrentDoctor(userId?: string): UseCurrentDoctorResult {
  const [doctor, setDoctor] = useState<DoctorWithProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => { setIsClient(true) }, [])

  const fetchCurrentDoctor = useCallback(async () => {
    if (!userId || !isClient) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const data = await doctorService.getDoctorByUserId(userId)
      setDoctor(data)
    } catch (err) {
      logger.error('[useCurrentDoctor] fetch error:', err)
      setError(err instanceof Error ? err.message : 'Error al cargar doctor')
    } finally {
      setLoading(false)
    }
  }, [userId, isClient])

  useEffect(() => {
    void fetchCurrentDoctor()
  }, [fetchCurrentDoctor])

  return { doctor, loading, error, refetch: fetchCurrentDoctor }
}

// ─── useRealDoctors ──────────────────────────────────────────────────────────

interface UseDoctorsResult {
  doctors: DoctorWithProfile[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useRealDoctors(): UseDoctorsResult {
  const [doctors, setDoctors] = useState<DoctorWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => { setIsClient(true) }, [])

  const fetchDoctors = useCallback(async () => {
    if (!isClient) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const data = await doctorService.getDoctors()
      setDoctors(data)
    } catch (err) {
      logger.error('[useRealDoctors] fetch error:', err)
      setError(err instanceof Error ? err.message : 'Error al cargar doctores')
    } finally {
      setLoading(false)
    }
  }, [isClient])

  useEffect(() => {
    let cancelled = false
    if (!isClient) return
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await doctorService.getDoctors()
        if (!cancelled) setDoctors(data)
      } catch (err) {
        if (!cancelled) {
          logger.error('[useRealDoctors] fetch error:', err)
          setError(err instanceof Error ? err.message : 'Error al cargar doctores')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [isClient])

  return { doctors, loading, error, refetch: fetchDoctors }
}

// ─── useDoctorsBySpecialty ────────────────────────────────────────────────────

interface UseDoctorsBySpecialtyResult {
  doctors: DoctorWithProfile[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useDoctorsBySpecialty(specialty: string): UseDoctorsBySpecialtyResult {
  const [doctors, setDoctors] = useState<DoctorWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => { setIsClient(true) }, [])

  const fetchDoctorsBySpecialty = useCallback(async () => {
    if (!specialty || !isClient) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const data = await doctorService.getDoctorsBySpecialty(specialty)
      setDoctors(data)
    } catch (err) {
      logger.error('[useDoctorsBySpecialty] fetch error:', err)
      setError(err instanceof Error ? err.message : 'Error al cargar doctores')
    } finally {
      setLoading(false)
    }
  }, [specialty, isClient])

  useEffect(() => {
    void fetchDoctorsBySpecialty()
  }, [fetchDoctorsBySpecialty])

  return { doctors, loading, error, refetch: fetchDoctorsBySpecialty }
}
