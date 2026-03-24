'use client'

import { useState, useCallback, useEffect } from 'react'
import { logger } from '@autamedica/shared'
import { fetchApi } from '@/lib/api-client'

interface ReviewInput {
  appointment_id: string
  overall_rating: number
  punctuality_rating?: number
  communication_rating?: number
  professionalism_rating?: number
  clinical_quality_rating?: number
  comment?: string
  is_anonymous?: boolean
}

interface UseReviewsResult {
  reviewedAppointmentIds: Set<string>
  loading: boolean
  submitting: boolean
  error: string | null
  submitReview: (data: ReviewInput) => Promise<boolean>
  refreshReviewed: () => Promise<void>
}

export function useReviews(): UseReviewsResult {
  const [reviewedAppointmentIds, setReviewedAppointmentIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshReviewed = useCallback(async () => {
    try {
      const data = await fetchApi<string[]>('/api/patients/reviews')
      setReviewedAppointmentIds(new Set(data ?? []))
    } catch (err) {
      logger.error('[useReviews] Error fetching reviewed appointments:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const submitReview = useCallback(async (data: ReviewInput): Promise<boolean> => {
    setSubmitting(true)
    setError(null)

    try {
      await fetchApi('/api/patients/reviews', { body: data })
      setReviewedAppointmentIds(prev => new Set([...prev, data.appointment_id]))
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al enviar la evaluacion'
      setError(message)
      logger.error('[useReviews] Submit error:', err)
      return false
    } finally {
      setSubmitting(false)
    }
  }, [])

  useEffect(() => {
    refreshReviewed()
  }, [refreshReviewed])

  return {
    reviewedAppointmentIds,
    loading,
    submitting,
    error,
    submitReview,
    refreshReviewed,
  }
}
