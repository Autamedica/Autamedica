/**
 * Repository: doctor_reviews and review-related appointment queries.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@autamedica/shared'

type AdminClient = SupabaseClient

interface AppointmentForReview {
  id: string
  doctor_id: string | null
  patient_id: string
  status: string
  start_time: string
}

export const reviewsRepo = {
  async listReviewedAppointmentIds(
    admin: AdminClient,
    patientId: string,
  ): Promise<string[]> {
    const { data, error } = await admin
      .from('doctor_reviews')
      .select('appointment_id')
      .eq('patient_id', patientId)

    if (error) {
      logger.error('[reviewsRepo] listReviewedAppointmentIds failed', error)
      throw error
    }

    return (data ?? []).map((r: { appointment_id: string }) => r.appointment_id)
  },

  async findAppointmentForReview(
    admin: AdminClient,
    appointmentId: string,
    patientId: string,
  ): Promise<AppointmentForReview | null> {
    const { data, error } = await admin
      .from('appointments')
      .select('id, doctor_id, patient_id, status, start_time')
      .eq('id', appointmentId)
      .eq('patient_id', patientId)
      .single()

    if (error || !data) return null
    return data as AppointmentForReview
  },

  async insertReview(
    userScopedClient: SupabaseClient,
    review: {
      appointment_id: string
      patient_id: string
      doctor_id: string
      overall_rating: number
      punctuality_rating: number | null
      communication_rating: number | null
      professionalism_rating: number | null
      clinical_quality_rating: number | null
      comment: string | null
      is_anonymous: boolean
    },
  ): Promise<{ id: string }> {
    const { data, error } = await userScopedClient
      .from('doctor_reviews')
      .insert(review as never)
      .select('id')
      .single()

    if (error) throw error
    return data as { id: string }
  },
}
