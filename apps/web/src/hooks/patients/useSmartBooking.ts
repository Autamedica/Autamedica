'use client'

import { useState, useCallback } from 'react'
import { logger } from '@autamedica/shared'
import { fetchApi } from '@/lib/api-client'
import type { AppointmentWithDoctor, CreateAppointmentInput } from '@/lib/patients/types/appointment'

export interface SlotSuggestion {
  doctorId: string
  doctorName: string
  specialty: string
  date: string
  startTime: string
  endTime: string
  durationMinutes: number
  location: string | null
}

interface SmartSuggestResponse {
  specialty: string
  specialtyDisplay: string
  urgency: string
  urgencyLabel: string
  suggestions: SlotSuggestion[]
}

interface UseSmartBookingResult {
  loading: boolean
  error: string | null
  specialty: string | null
  specialtyDisplay: string | null
  urgency: string | null
  urgencyLabel: string | null
  suggestions: SlotSuggestion[]
  booking: boolean
  bookedAppointment: AppointmentWithDoctor | null
  fetchSuggestions: (anamnesisId?: string) => Promise<void>
  bookSuggestion: (doctorId: string, startTime: string, durationMinutes: number) => Promise<boolean>
  reset: () => void
}

export function useSmartBooking(): UseSmartBookingResult {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [specialty, setSpecialty] = useState<string | null>(null)
  const [specialtyDisplay, setSpecialtyDisplay] = useState<string | null>(null)
  const [urgency, setUrgency] = useState<string | null>(null)
  const [urgencyLabel, setUrgencyLabel] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<SlotSuggestion[]>([])
  const [booking, setBooking] = useState(false)
  const [bookedAppointment, setBookedAppointment] = useState<AppointmentWithDoctor | null>(null)

  const fetchSuggestions = useCallback(async (anamnesisId?: string) => {
    setLoading(true)
    setError(null)
    try {
      const body: Record<string, string> = {}
      if (anamnesisId) body.anamnesisId = anamnesisId
      const data = await fetchApi<SmartSuggestResponse>(
        '/api/patients/appointments/smart-suggest',
        { body },
      )
      setSpecialty(data.specialty)
      setSpecialtyDisplay(data.specialtyDisplay)
      setUrgency(data.urgency)
      setUrgencyLabel(data.urgencyLabel)
      setSuggestions(data.suggestions)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al obtener sugerencias'
      setError(msg)
      logger.error('[useSmartBooking] fetchSuggestions failed', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const bookSuggestion = useCallback(async (
    doctorId: string,
    startTime: string,
    durationMinutes: number,
  ): Promise<boolean> => {
    setBooking(true)
    setError(null)
    try {
      const input: CreateAppointmentInput = {
        doctor_id: doctorId,
        start_time: startTime,
        duration_minutes: durationMinutes,
        type: 'consultation',
        reason: specialty ? `Derivación automática: ${specialty}` : undefined,
      }
      const created = await fetchApi<AppointmentWithDoctor>(
        '/api/patients/appointments',
        { body: input },
      )
      setBookedAppointment(created)
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al agendar la cita'
      setError(msg)
      logger.error('[useSmartBooking] bookSuggestion failed', err)
      return false
    } finally {
      setBooking(false)
    }
  }, [specialty])

  const reset = useCallback(() => {
    setLoading(false)
    setError(null)
    setSpecialty(null)
    setSpecialtyDisplay(null)
    setUrgency(null)
    setUrgencyLabel(null)
    setSuggestions([])
    setBooking(false)
    setBookedAppointment(null)
  }, [])

  return {
    loading,
    error,
    specialty,
    specialtyDisplay,
    urgency,
    urgencyLabel,
    suggestions,
    booking,
    bookedAppointment,
    fetchSuggestions,
    bookSuggestion,
    reset,
  }
}
