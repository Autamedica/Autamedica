import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import { scheduleReminders, cancelReminders, processWaitlist } from '@autamedica/scheduling'
import { isPastAppointmentStart } from '@/lib/appointments/time'
import type {
  AppointmentWithDoctor,
  AppointmentType,
  AppointmentStatus,
} from '@/lib/patients/types/appointment'
import type { IAppointmentsRepository } from '@/lib/patients/ports/appointments.port'

import { assertCountryPair } from '@/lib/patients/care-country'

type Db = SupabaseClient<Database>

export interface CreateAppointmentPayload {
  start_time: string
  doctor_id: string
  duration_minutes?: number
  type?: AppointmentType
  notes?: string
  reason?: string
  meeting_url?: string | null
  location?: string | null
}

export interface UpdateAppointmentPayload {
  start_time?: string
  duration_minutes?: number
  status?: AppointmentStatus
  type?: AppointmentType
  notes?: string
  reason?: string
  meeting_url?: string | null
  location?: string | null
}

/**
 * Allowed status transitions for patients.
 * Patients can only cancel their own scheduled appointments.
 */
const PATIENT_ALLOWED_TRANSITIONS: Record<string, AppointmentStatus[]> = {
  payment_pending: ['cancelled'],
  scheduled: ['cancelled'],
  confirmed: ['cancelled'],
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
    const { start_time, doctor_id } = payload

    if (!start_time?.trim()) throw new Error('start_time is required')
    if (!doctor_id?.trim()) throw new Error('doctor_id is required')

    const scheduledDate = new Date(start_time)
    if (Number.isNaN(scheduledDate.getTime())) {
      throw Object.assign(new Error('start_time is invalid'), { code: 'VALIDATION' })
    }
    if (isPastAppointmentStart(scheduledDate.toISOString())) {
      throw Object.assign(new Error('No se puede programar una cita en el pasado'), { code: 'VALIDATION' })
    }

    await assertCountryPair(deps.dbClient, patientId, doctor_id)

    const doctorExists = await deps.appointmentsRepo.doctorExists(doctor_id)
    if (!doctorExists) throw Object.assign(new Error('Doctor not found or inactive'), { code: 'DOCTOR_NOT_FOUND' })

    // Verify doctor has real availability configured (prevents no-show from unconfigured schedules)
    const hasRealAvailability = await checkDoctorHasRealAvailability(deps.dbClient, doctor_id)
    if (!hasRealAvailability) {
      throw Object.assign(
        new Error('Este profesional aún no configuró su disponibilidad. No se pueden agendar turnos.'),
        { code: 'NO_AVAILABILITY' },
      )
    }

    try {
      const appointment = await deps.appointmentsRepo.create(patientId, payload)
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
    if (payload.start_time) {
      const scheduledDate = new Date(payload.start_time)
      if (Number.isNaN(scheduledDate.getTime())) {
        throw Object.assign(new Error('start_time is invalid'), { code: 'VALIDATION' })
      }
      if (isPastAppointmentStart(scheduledDate.toISOString())) {
        throw Object.assign(new Error('No se puede programar una cita en el pasado'), { code: 'VALIDATION' })
      }
    }

    if (payload.status) {
      const existing = await deps.appointmentsRepo.findById(id, patientId)
      if (!existing) throw Object.assign(new Error('Appointment not found'), { code: 'NOT_FOUND' })

      const currentStatus = existing.status
      const allowed = PATIENT_ALLOWED_TRANSITIONS[currentStatus]
      if (!allowed?.includes(payload.status)) {
        throw Object.assign(
          new Error(`Patients cannot transition from '${currentStatus}' to '${payload.status}'`),
          { code: 'INVALID_TRANSITION' },
        )
      }
    }

    try {
      const updated = await deps.appointmentsRepo.update(id, patientId, payload)

      if (payload.start_time) {
        try {
          await cancelReminders(deps.dbClient, id)
          await scheduleReminders(deps.dbClient, id, 'whatsapp')
        } catch (reminderErr) {
          logger.error('[appointmentsUseCase] reschedule reminders failed', {
            appointmentId: id,
            error: reminderErr,
          })
        }
      }

      return updated
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

      try {
        await cancelReminders(deps.dbClient, id)
      } catch (reminderErr) {
        logger.error('[appointmentsUseCase] cancelReminders failed', {
          appointmentId: id,
          error: reminderErr,
        })
      }

      if (existing.start_time && existing.end_time) {
        try {
          await processWaitlist(deps.dbClient, existing.doctor_id, {
            date: existing.start_time.split('T')[0],
            start_time: existing.start_time,
            end_time: existing.end_time,
          })
        } catch (waitlistErr) {
          logger.error('[appointmentsUseCase] processWaitlist failed', {
            appointmentId: id,
            error: waitlistErr,
          })
        }
      }

      return cancelled
    } catch (err) {
      logger.error('[appointmentsUseCase] cancel failed', err)
      throw err
    }
  },
}

/**
 * Checks if a doctor has real availability configured (not the old fake 24/7 preset).
 * A doctor with only 00:00-23:59 entries for all 7 days is treated as unconfigured.
 */
async function checkDoctorHasRealAvailability(db: Db, doctorId: string): Promise<boolean> {
  const { data, error } = await db
    .from('doctor_availability')
    .select('start_time, end_time')
    .eq('doctor_id', doctorId)
    .eq('is_active', true)

  if (error) {
    logger.error('[checkDoctorHasRealAvailability] query failed', error)
    // Fail open: allow booking if we can't check (avoid blocking legitimate patients)
    return true
  }

  if (!data || data.length === 0) return false

  // Detect fake 24/7 preset
  const allFake = data.length >= 7 && data.every(
    (s) => s.start_time === '00:00:00' && s.end_time === '23:59:00',
  )

  return !allFake
}

