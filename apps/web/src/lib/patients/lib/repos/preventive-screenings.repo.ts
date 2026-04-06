/**
 * Repository: preventive screenings CRUD.
 * Manages patient_screenings and the preventive_screenings catalog.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import type { ScreeningStatusType } from '@autamedica/types'
import { logger } from '@autamedica/shared'

type AdminClient = SupabaseClient<Database>

interface PatientScreeningFilters {
  status?: ScreeningStatusType
}

interface UpsertScreeningData {
  screening_id: string
  status: ScreeningStatusType
  scheduled_date?: string | null
  notes?: string | null
}

interface UpdateStatusFields {
  status: ScreeningStatusType
  completed_date?: string | null
  next_due_date?: string | null
  result_summary?: string | null
}

export const preventiveScreeningsRepo = {
  async listByPatient(
    admin: AdminClient,
    patientId: string,
    filters?: PatientScreeningFilters,
  ) {
    let query = admin
      .from('patient_screenings')
      .select('*, preventive_screening:preventive_screenings(*)')
      .eq('patient_id', patientId)

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    const { data, error } = await query

    if (error) {
      logger.error('[preventiveScreeningsRepo] listByPatient failed', error)
      throw error
    }
    return data ?? []
  },

  async listCatalog(admin: AdminClient) {
    const { data, error } = await admin
      .from('preventive_screenings')
      .select('*')
      .order('category', { ascending: true })
      .order('name', { ascending: true })

    if (error) {
      logger.error('[preventiveScreeningsRepo] listCatalog failed', error)
      throw error
    }
    return data ?? []
  },

  async findPatientData(admin: AdminClient, patientId: string) {
    const { data, error } = await admin
      .from('patients')
      .select('birth_date, gender')
      .eq('id', patientId)
      .single()

    if (error) {
      logger.error('[preventiveScreeningsRepo] findPatientData failed', error)
      throw error
    }
    return data
  },

  async upsertPatientScreening(
    admin: AdminClient,
    patientId: string,
    input: UpsertScreeningData,
  ) {
    const { data: existing } = await admin
      .from('patient_screenings')
      .select('id')
      .eq('patient_id', patientId)
      .eq('screening_id', input.screening_id)
      .maybeSingle()

    if (existing) {
      const { data, error } = await admin
        .from('patient_screenings')
        .update({
          status: input.status,
          scheduled_date: input.scheduled_date ?? null,
          notes: input.notes ?? null,
        } as never)
        .eq('id', existing.id)
        .select('*')
        .single()

      if (error) {
        logger.error('[preventiveScreeningsRepo] upsertPatientScreening update failed', error)
        throw error
      }
      return data
    }

    const { data, error } = await admin
      .from('patient_screenings')
      .insert({
        patient_id: patientId,
        screening_id: input.screening_id,
        status: input.status,
        scheduled_date: input.scheduled_date ?? null,
        notes: input.notes ?? null,
      } as never)
      .select('*')
      .single()

    if (error) {
      logger.error('[preventiveScreeningsRepo] upsertPatientScreening insert failed', error)
      throw error
    }
    return data
  },

  async updateStatus(admin: AdminClient, id: string, fields: UpdateStatusFields) {
    const { data, error } = await admin
      .from('patient_screenings')
      .update({
        status: fields.status,
        completed_date: fields.completed_date ?? null,
        next_due_date: fields.next_due_date ?? null,
        result_summary: fields.result_summary ?? null,
      } as never)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      logger.error('[preventiveScreeningsRepo] updateStatus failed', error)
      throw error
    }
    return data
  },

  async getScreeningById(admin: AdminClient, screeningId: string) {
    const { data, error } = await admin
      .from('preventive_screenings')
      .select('recommended_frequency')
      .eq('id', screeningId)
      .single()

    if (error) {
      logger.error('[preventiveScreeningsRepo] getScreeningById failed', error)
      throw error
    }
    return data
  },
}
