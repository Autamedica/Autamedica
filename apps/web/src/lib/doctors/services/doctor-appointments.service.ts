import { fetchApi } from '@/lib/api-client'
import type {
  CreateDoctorAppointmentInput,
  DoctorAppointmentFormValues,
  DoctorAppointmentRecord,
  DoctorAppointmentType,
} from '@/lib/doctors/types/appointments'

const DOCTOR_APPOINTMENT_TYPES: DoctorAppointmentType[] = [
  'telemedicine',
  'consultation',
  'follow_up',
  'emergency',
]

function combineDateAndTime(date: string, time: string): string {
  const iso = `${date}T${time}:00`
  const value = new Date(iso)

  if (Number.isNaN(value.getTime())) {
    throw new Error('Fecha u hora invalidas')
  }

  return value.toISOString()
}

export function buildDoctorAppointmentPayload(
  values: DoctorAppointmentFormValues,
): CreateDoctorAppointmentInput {
  const patientId = values.patientId.trim()
  const date = values.date.trim()
  const time = values.time.trim()
  const notes = values.notes.trim()
  const location = values.location.trim()

  if (!patientId) throw new Error('Selecciona un paciente')
  if (!date) throw new Error('Selecciona una fecha')
  if (!time) throw new Error('Selecciona una hora')
  if (!Number.isFinite(values.durationMinutes) || values.durationMinutes < 5) {
    throw new Error('La duracion debe ser de al menos 5 minutos')
  }
  if (!DOCTOR_APPOINTMENT_TYPES.includes(values.type)) {
    throw new Error('Tipo de cita invalido')
  }

  return {
    patient_id: patientId,
    scheduled_at: combineDateAndTime(date, time),
    duration_minutes: values.durationMinutes,
    type: values.type,
    notes: notes || undefined,
    location:
      values.type === 'telemedicine'
        ? null
        : location || null,
  }
}

export const doctorAppointmentsService = {
  async list(): Promise<DoctorAppointmentRecord[]> {
    return fetchApi<DoctorAppointmentRecord[]>('/api/doctors/appointments')
  },

  async create(values: DoctorAppointmentFormValues): Promise<DoctorAppointmentRecord> {
    const payload = buildDoctorAppointmentPayload(values)
    return fetchApi<DoctorAppointmentRecord>('/api/doctors/appointments', {
      method: 'POST',
      body: payload,
    })
  },
}
