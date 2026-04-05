import type {
  Appointment,
  AppointmentInsert,
  IAppointmentCommandRepository,
  ISODateString,
  IPatientRepository,
  UUID,
} from '@autamedica/types'
import type { IEventBus } from '@autamedica/shared'
import type { CreateDoctorAppointmentInput } from '@/lib/doctors/types/appointments'

interface ScheduleDoctorAppointmentDeps {
  appointmentRepo: IAppointmentCommandRepository<Appointment>
  patientRepo: IPatientRepository
  eventBus: IEventBus
}

interface ScheduleDoctorAppointmentContext {
  doctorId: string
}

export class ScheduleDoctorAppointmentUseCase {
  constructor(private readonly deps: ScheduleDoctorAppointmentDeps) {}

  async execute(
    context: ScheduleDoctorAppointmentContext,
    payload: CreateDoctorAppointmentInput,
  ): Promise<Appointment> {
    const patientId = payload.patient_id.trim()
    const startTime = payload.start_time.trim()

    if (!patientId) {
      throw Object.assign(new Error('patient_id is required'), { code: 'VALIDATION' })
    }

    if (!startTime) {
      throw Object.assign(new Error('start_time is required'), { code: 'VALIDATION' })
    }

    const scheduledDate = new Date(startTime)
    if (Number.isNaN(scheduledDate.getTime())) {
      throw Object.assign(new Error('start_time is invalid'), { code: 'VALIDATION' })
    }

    if (!Number.isFinite(payload.duration_minutes) || payload.duration_minutes < 5) {
      throw Object.assign(new Error('duration_minutes must be at least 5'), { code: 'VALIDATION' })
    }

    const patient = await this.deps.patientRepo.findById(patientId as UUID)
    if (!patient) {
      throw Object.assign(new Error('Patient not found or inactive'), { code: 'PATIENT_NOT_FOUND' })
    }

    const insert: AppointmentInsert = {
      doctor_id: context.doctorId as UUID,
      start_time: startTime as ISODateString,
      duration_minutes: payload.duration_minutes,
      type: payload.type,
      status: 'scheduled',
      notes: payload.notes?.trim() || null,
      location: payload.location?.trim() || null,
    }

    const created = await this.deps.appointmentRepo.create(patientId, insert)

    await this.deps.eventBus.emit('appointment.scheduled', {
      appointmentId: created.id,
      doctorId: context.doctorId,
      patientId,
      startTime: created.start_time,
    })

    return created
  }
}
