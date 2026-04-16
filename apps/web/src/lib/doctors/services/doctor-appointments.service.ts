import { fetchApi } from '@/lib/api-client'
import type {
  CreateDoctorAppointmentInput,
  DoctorAppointmentRecord,
  UpdateDoctorAppointmentInput,
} from '@/lib/doctors/types/appointments'
import type { AppointmentStatus } from '@autamedica/types'

export const doctorAppointmentsService = {
  async list(): Promise<DoctorAppointmentRecord[]> {
    return fetchApi<DoctorAppointmentRecord[]>('/api/doctors/appointments')
  },

  async create(payload: CreateDoctorAppointmentInput): Promise<DoctorAppointmentRecord> {
    return fetchApi<DoctorAppointmentRecord>('/api/doctors/appointments', {
      method: 'POST',
      body: payload,
    })
  },

  async update(id: string, payload: UpdateDoctorAppointmentInput): Promise<DoctorAppointmentRecord> {
    return fetchApi<DoctorAppointmentRecord>(`/api/doctors/appointments/${id}`, {
      method: 'PATCH',
      body: payload,
    })
  },

  async transition(id: string, status: AppointmentStatus | 're_queue'): Promise<DoctorAppointmentRecord> {
    return fetchApi<DoctorAppointmentRecord>(`/api/doctors/appointments/${id}/transition`, {
      method: 'POST',
      body: { status },
    })
  },
}
