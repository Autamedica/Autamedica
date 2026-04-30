import type { Call, CallStatus } from '@autamedica/telemedicine'

export interface StartCallAppointmentRecord {
  id: string
  doctor_id: string
  patient_id: string | null
  type: string | null
  status: string
  start_time: string | null
  end_time: string | null
  duration_minutes: number | null
  created_by: string | null
}

export interface ICallStartRepository {
  findAppointmentById(appointmentId: string): Promise<StartCallAppointmentRecord | null>
  findPatientById(patientId: string): Promise<{ id: string } | null>
  findActiveByAppointmentId(appointmentId: string): Promise<Call | null>
  findActiveByParticipants(doctorId: string, patientId: string | null): Promise<Call | null>
  listPendingByParticipants(doctorId: string, patientId: string | null): Promise<Call[]>
  createCall(doctorId: string, patientId: string | null, appointmentId?: string): Promise<Call>
  updateCallStatus(callId: string, status: CallStatus, reason?: string): Promise<boolean>
  cancelCallsBatch(calls: Array<{ id: string; status: string }>, reason: string): Promise<void>
}
