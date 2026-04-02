import { domainEvents, logger } from '@autamedica/shared'
import { scheduleReminders } from '@autamedica/scheduling'
import { createAstroAdminClient } from '@/lib/supabase'
import { createPatientRepositoryAdapter } from '@/lib/doctors/lib/repos/patients'
import { createDoctorAppointmentCommandAdapter } from '@/lib/doctors/lib/repos/doctor-appointments'
import { listDoctorAppointmentsView } from '@/lib/doctors/queries/doctor-appointments.query'
import { ScheduleDoctorAppointmentUseCase } from '@/lib/doctors/usecases/ScheduleDoctorAppointmentUseCase'
import type { CreateDoctorAppointmentInput } from '@/lib/doctors/types/appointments'

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
}
