import type {
  Appointment,
  AppointmentInsert,
  IAppointmentCommandRepository,
  ISODateString,
  IPatientRepository,
  UUID,
} from '@autamedica/types'
import type { IEventBus } from '@autamedica/shared'
import { isPastAppointmentStart } from '@/lib/appointments/time'
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
    payload: CreateDoctorAppointmentInput & { guest_name?: string },
  ): Promise<Appointment> {
    const patientId = payload.patient_id?.trim()
    const startTime = payload.start_time.trim()
    const guestName = payload.guest_name?.trim()

    if (!patientId && !guestName) {
      throw Object.assign(new Error('patient_id or guest_name is required'), { code: 'VALIDATION' })
    }

    if (!startTime) {
      throw Object.assign(new Error('start_time is required'), { code: 'VALIDATION' })
    }

    const scheduledDate = new Date(startTime)
    if (Number.isNaN(scheduledDate.getTime())) {
      throw Object.assign(new Error('start_time is invalid'), { code: 'VALIDATION' })
    }

    if (isPastAppointmentStart(scheduledDate.toISOString())) {
      throw Object.assign(new Error('No se puede programar una cita en el pasado'), { code: 'VALIDATION' })
    }

    if (!Number.isFinite(payload.duration_minutes) || payload.duration_minutes < 5) {
      throw Object.assign(new Error('duration_minutes must be at least 5'), { code: 'VALIDATION' })
    }

    let finalNotes = payload.notes?.trim() || null
    if (guestName) {
      finalNotes = finalNotes ? `[INVITADO: ${guestName}] ${finalNotes}` : `[INVITADO: ${guestName}]`
    }

    if (patientId) {
      const patient = await this.deps.patientRepo.findById(patientId as UUID)
      if (!patient) {
        throw Object.assign(new Error('Patient not found or inactive'), { code: 'PATIENT_NOT_FOUND' })
      }
    }

    const insert: AppointmentInsert = {
      doctor_id: context.doctorId as UUID,
      patient_id: (patientId as UUID) || null,
      start_time: scheduledDate.toISOString() as ISODateString,
      duration_minutes: payload.duration_minutes,
      type: payload.type,
      status: 'scheduled',
      notes: finalNotes,
      location: payload.location?.trim() || null,
    }

    // El repoAdapter debe soportar null en patientId
    const created = await this.deps.appointmentRepo.create(patientId || '', insert)

    await this.deps.eventBus.emit('appointment.scheduled', {
      appointmentId: created.id,
      doctorId: context.doctorId,
      patientId: patientId || null,
      startTime: created.start_time,
    })

    return created
  }
}
