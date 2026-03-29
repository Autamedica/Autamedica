/**
 * Backend Service: appointments business logic.
 * Orchestrates repository access for API controllers.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import { scheduleReminders, cancelReminders, processWaitlist } from '@autamedica/scheduling'
import { appointmentsRepo } from '@/lib/patients/lib/repos/appointments.repo'
import type {
  AppointmentWithDoctor,
  AppointmentType,
  AppointmentStatus,
} from '@/lib/patients/types/appointment'

type Db = SupabaseClient<Database>

export interface CreateAppointmentPayload {
  scheduled_at: string
  doctor_id: string
  duration_minutes?: number
  type?: AppointmentType
  notes?: string
  reason?: string
  meeting_url?: string | null
  location?: string | null
}

export interface UpdateAppointmentPayload {
  scheduled_at?: string
  duration_minutes?: number
  status?: AppointmentStatus
  type?: AppointmentType
  notes?: string
  meeting_url?: string | null
  location?: string | null
}

export const appointmentsService = {
  async listByPatient(supabase: Db, patientId: string): Promise<AppointmentWithDoctor[]> {
    return appointmentsRepo.listByPatient(supabase, patientId)
  },

  async getById(
    supabase: Db,
    id: string,
    patientId: string,
  ): Promise<AppointmentWithDoctor | null> {
    return appointmentsRepo.findById(supabase, id, patientId)
  },

  async create(
    supabase: Db,
    patientId: string,
    payload: CreateAppointmentPayload,
  ): Promise<AppointmentWithDoctor> {
    const { scheduled_at, doctor_id } = payload

    if (!scheduled_at?.trim()) throw new Error('scheduled_at is required')
    if (!doctor_id?.trim()) throw new Error('doctor_id is required')

    const doctorExists = await appointmentsRepo.doctorExists(supabase, doctor_id)
    if (!doctorExists) throw Object.assign(new Error('Doctor not found or inactive'), { code: 'DOCTOR_NOT_FOUND' })

    try {
      const appointment = await appointmentsRepo.create(supabase, patientId, payload)

      // Fire-and-forget: programar recordatorios 24h y 2h antes
      scheduleReminders(supabase, appointment.id, 'whatsapp').catch((err) =>
        logger.error('[appointmentsService] scheduleReminders failed', err),
      )

      return appointment
    } catch (err) {
      logger.error('[appointmentsService] create failed', err)
      throw err
    }
  },

  async update(
    supabase: Db,
    id: string,
    patientId: string,
    payload: UpdateAppointmentPayload,
  ): Promise<AppointmentWithDoctor> {
    try {
      return await appointmentsRepo.update(supabase, id, patientId, payload)
    } catch (err) {
      logger.error('[appointmentsService] update failed', err)
      throw err
    }
  },

  async cancel(
    supabase: Db,
    id: string,
    patientId: string,
  ): Promise<AppointmentWithDoctor | null> {
    try {
      // Leer la cita antes de cancelar para obtener datos del slot liberado
      const existing = await appointmentsRepo.findById(supabase, id, patientId)
      if (!existing) return null

      const cancelled = await appointmentsRepo.cancel(supabase, id, patientId)

      // Fire-and-forget: cancelar recordatorios pendientes
      cancelReminders(supabase, id).catch((err) =>
        logger.error('[appointmentsService] cancelReminders failed', err),
      )

      // Fire-and-forget: ofrecer slot liberado a la waitlist
      if (existing.start_time && existing.end_time) {
        processWaitlist(supabase, existing.doctor_id, {
          date: existing.start_time.split('T')[0],
          start_time: existing.start_time,
          end_time: existing.end_time,
        }).catch((err) =>
          logger.error('[appointmentsService] processWaitlist failed', err),
        )
      }

      return cancelled
    } catch (err) {
      logger.error('[appointmentsService] cancel failed', err)
      throw err
    }
  },
}
