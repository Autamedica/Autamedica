import type {
  AppointmentWithDoctor,
  AppointmentType,
  AppointmentStatus,
  CreateAppointmentInput,
} from '@/lib/patients/types/appointment'

export interface IAppointmentsRepository {
  listByPatient(patientId: string): Promise<AppointmentWithDoctor[]>
  findById(id: string, patientId: string): Promise<AppointmentWithDoctor | null>
  doctorExists(doctorId: string): Promise<boolean>
  create(
    patientId: string,
    input: CreateAppointmentInput & { meeting_url?: string | null; location?: string | null }
  ): Promise<AppointmentWithDoctor>
  update(
    id: string,
    patientId: string,
    patch: {
      start_time?: string
      duration_minutes?: number
      status?: AppointmentStatus
      type?: AppointmentType
      notes?: string
      reason?: string
      meeting_url?: string | null
      location?: string | null
    }
  ): Promise<AppointmentWithDoctor>
  cancel(id: string, patientId: string): Promise<AppointmentWithDoctor | null>
}
