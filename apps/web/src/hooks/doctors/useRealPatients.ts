/**
 * Hooks: Patient UI State.
 * Consumes patientService for all business logic and DB access.
 * Only manages React state (loading, error, data) + event coordination.
 */
'use client'

import { useCallback, useEffect, useState } from 'react'
import { logger } from '@autamedica/shared'
import { patientService } from '@/lib/doctors/services/patient.service'
import type { PatientWithProfile } from '@autamedica/types'

// ─── useRealPatients ────────────────────────────────────────────────────────
// State hook for the complete list of active patients.

interface UsePatientsResult {
  patients: PatientWithProfile[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useRealPatients(): UsePatientsResult {
  const [patients, setPatients] = useState<PatientWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => setIsClient(true), [])

  const fetchPatients = useCallback(async () => {
    if (!isClient) return
    try {
      setLoading(true)
      setError(null)
      const data = await patientService.getActivePatients()
      setPatients(data)
    } catch (err) {
      logger.error('[useRealPatients] fetch error:', err)
      setError(err instanceof Error ? err.message : 'Error al cargar pacientes')
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
        const data = await patientService.getActivePatients()
        if (!cancelled) setPatients(data)
      } catch (err) {
        if (!cancelled) {
          logger.error('[useRealPatients] fetch error:', err)
          setError(err instanceof Error ? err.message : 'Error al cargar pacientes')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [isClient])

  return { patients, loading, error, refetch: fetchPatients }
}

// ─── useCurrentPatient ──────────────────────────────────────────────────────
// State hook for a specific patient by user_id (context-aware).

interface UseCurrentPatientResult {
  patient: PatientWithProfile | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useCurrentPatient(userId?: string): UseCurrentPatientResult {
  const [patient, setPatient] = useState<PatientWithProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => setIsClient(true), [])

  const fetchCurrentPatient = useCallback(async () => {
    if (!userId || !isClient) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const data = await patientService.getPatientById(userId as unknown as import('@autamedica/types').UUID)
      setPatient(data)
    } catch (err) {
      logger.error('[useCurrentPatient] fetch error:', err)
      setError(err instanceof Error ? err.message : 'Error al cargar paciente actual')
    } finally {
      setLoading(false)
    }
  }, [userId, isClient])

  useEffect(() => {
    void fetchCurrentPatient()
  }, [fetchCurrentPatient])

  return { patient, loading, error, refetch: fetchCurrentPatient }
}

// ─── useDoctorPatients ──────────────────────────────────────────────────────
// Optimized hook for patients assigned to the current doctor.

interface UseDoctorPatientsResult {
  patients: PatientWithProfile[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useDoctorPatients(doctorUserId?: string): UseDoctorPatientsResult {
  const [patients, setPatients] = useState<PatientWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => setIsClient(true), [])

  const fetchDoctorPatients = useCallback(async () => {
    if (!doctorUserId || !isClient) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const data = await patientService.getAssignedPatients(doctorUserId)
      setPatients(data)
    } catch (err) {
      logger.error('[useDoctorPatients] fetch error:', err)
      setError(err instanceof Error ? err.message : 'Error al cargar pacientes asignados')
    } finally {
      setLoading(false)
    }
  }, [doctorUserId, isClient])

  useEffect(() => {
    void fetchDoctorPatients()
  }, [fetchDoctorPatients])

  return { patients, loading, error, refetch: fetchDoctorPatients }
}

// ─── usePatientsByCompany ───────────────────────────────────────────────────

interface UsePatientsByCompanyResult {
  patients: PatientWithProfile[]
  loading: boolean
  error: string | null
  refetch: () => void
}

export function usePatientsByCompany(companyId?: string): UsePatientsByCompanyResult {
  const [patients, setPatients] = useState<PatientWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => setIsClient(true), [])

  const fetchPatientsByCompany = useCallback(async () => {
    if (!companyId || !isClient) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const data = await patientService.getPatientsByCompany(companyId)
      setPatients(data)
    } catch (err) {
      logger.error('[usePatientsByCompany] fetch error:', err)
      setError(err instanceof Error ? err.message : 'Error al cargar pacientes de empresa')
    } finally {
      setLoading(false)
    }
  }, [companyId, isClient])

  useEffect(() => {
    void fetchPatientsByCompany()
  }, [fetchPatientsByCompany])

  return { patients, loading, error, refetch: fetchPatientsByCompany }
}
