import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import { scheduleReminders, cancelReminders, processWaitlist } from '@autamedica/scheduling'
import type {
  AppointmentWithDoctor,
  AppointmentType,
  AppointmentStatus,
} from '@/lib/patients/types/appointment'
import type { IAppointmentsRepository } from '@/lib/patients/ports/appointments.port'

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

export interface AppointmentsUseCaseDeps {
  appointmentsRepo: IAppointmentsRepository
  dbClient: Db
}

export const appointmentsUseCase = {
  async listByPatient(deps: AppointmentsUseCaseDeps, patientId: string): Promise<AppointmentWithDoctor[]> {
    return deps.appointmentsRepo.listByPatient(patientId)
  },

  async getById(
    deps: AppointmentsUseCaseDeps,
    id: string,
    patientId: string,
  ): Promise<AppointmentWithDoctor | null> {
    return deps.appointmentsRepo.findById(id, patientId)
  },

  async create(
    deps: AppointmentsUseCaseDeps,
    patientId: string,
    payload: CreateAppointmentPayload,
  ): Promise<AppointmentWithDoctor> {
    const { scheduled_at, doctor_id } = payload

    if (!scheduled_at?.trim()) throw new Error('scheduled_at is required')
    if (!doctor_id?.trim()) throw new Error('doctor_id is required')

    const doctorExists = await deps.appointmentsRepo.doctorExists(doctor_id)
    if (!doctorExists) throw Object.assign(new Error('Doctor not found or inactive'), { code: 'DOCTOR_NOT_FOUND' })

    try {
      const appointment = await deps.appointmentsRepo.create(patientId, payload)

      // Fire-and-forget: programar recordatorios 24h y 2h antes
      scheduleReminders(deps.dbClient, appointment.id, 'whatsapp').catch((err) =>
        logger.error('[appointmentsUseCase] scheduleReminders failed', err),
      )

      return appointment
    } catch (err) {
      logger.error('[appointmentsUseCase] create failed', err)
      throw err
    }
  },

  async update(
    deps: AppointmentsUseCaseDeps,
    id: string,
    patientId: string,
    payload: UpdateAppointmentPayload,
  ): Promise<AppointmentWithDoctor> {
    try {
      return await deps.appointmentsRepo.update(id, patientId, payload)
    } catch (err) {
      logger.error('[appointmentsUseCase] update failed', err)
      throw err
    }
  },

  async cancel(
    deps: AppointmentsUseCaseDeps,
    id: string,
    patientId: string,
  ): Promise<AppointmentWithDoctor | null> {
    try {
      const existing = await deps.appointmentsRepo.findById(id, patientId)
      if (!existing) return null

      const cancelled = await deps.appointmentsRepo.cancel(id, patientId)

      cancelReminders(deps.dbClient, id).catch((err) =>
        logger.error('[appointmentsUseCase] cancelReminders failed', err),
      )

      if (existing.start_time && existing.end_time) {
        processWaitlist(deps.dbClient, existing.doctor_id, {
          date: existing.start_time.split('T')[0],
          start_time: existing.start_time,
          end_time: existing.end_time,
        }).catch((err) =>
          logger.error('[appointmentsUseCase] processWaitlist failed', err),
        )
      }

      return cancelled
    } catch (err) {
      logger.error('[appointmentsUseCase] cancel failed', err)
      throw err
    }
  },
}
