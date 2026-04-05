import { domainEvents, logger } from '@autamedica/shared'
import { scheduleReminders } from '@autamedica/scheduling'
import type { AppointmentUpdate } from '@autamedica/types'
import { createAstroAdminClient } from '@/lib/supabase'
import { createPatientRepositoryAdapter } from '@/lib/doctors/lib/repos/patients'
import { createDoctorAppointmentCommandAdapter } from '@/lib/doctors/lib/repos/doctor-appointments'
import { listDoctorAppointmentsView } from '@/lib/doctors/queries/doctor-appointments.query'
import { ScheduleDoctorAppointmentUseCase } from '@/lib/doctors/usecases/ScheduleDoctorAppointmentUseCase'
import { computeEndTime } from '@/lib/patients/api/appointment-utils'
import type { CreateDoctorAppointmentInput, UpdateDoctorAppointmentInput } from '@/lib/doctors/types/appointments'

interface DoctorScheduleContext {
  doctorId: string
  userId: string
}

export const doctorAppointmentsBackendService = {
  async listForDoctor(
    doctorId: string,
    runtimeEnv?: Record<string, unknown> | null,
  ) {
    const admin = createAstroAdminClient(runtimeEnv)
    return listDoctorAppointmentsView(admin, doctorId)
  },

  async createForDoctor(
    context: DoctorScheduleContext,
    payload: CreateDoctorAppointmentInput,
    runtimeEnv?: Record<string, unknown> | null,
  ) {
    const admin = createAstroAdminClient(runtimeEnv)
    const useCase = new ScheduleDoctorAppointmentUseCase({
      appointmentRepo: createDoctorAppointmentCommandAdapter(admin, context.doctorId, context.userId),
      patientRepo: createPatientRepositoryAdapter(admin),
      eventBus: domainEvents,
    })

    const created = await useCase.execute({ doctorId: context.doctorId }, payload)

    scheduleReminders(admin, created.id, 'whatsapp').catch((error) => {
      logger.error('[doctorAppointmentsBackendService] scheduleReminders failed', error)
    })

    return created
  },

  async updateForDoctor(
    appointmentId: string,
    doctorId: string,
    payload: UpdateDoctorAppointmentInput,
    runtimeEnv?: Record<string, unknown> | null,
  ) {
    const admin = createAstroAdminClient(runtimeEnv)
    const repo = createDoctorAppointmentCommandAdapter(admin, doctorId, doctorId)

    const patch: AppointmentUpdate = {}

    if (payload.start_time) {
      patch.start_time = payload.start_time
      const duration = payload.duration_minutes ?? 30
      patch.end_time = computeEndTime(payload.start_time, duration)
    }

    if (payload.duration_minutes !== undefined) {
      patch.duration_minutes = payload.duration_minutes
      if (payload.start_time) {
        patch.end_time = computeEndTime(payload.start_time, payload.duration_minutes)
      }
    }

    if (payload.type !== undefined) {
      patch.type = payload.type
    }

    if (payload.notes !== undefined) {
      patch.notes = payload.notes
    }

    if (payload.location !== undefined) {
      patch.location = payload.location
    }

    return repo.update(appointmentId, patch)
  },
}
