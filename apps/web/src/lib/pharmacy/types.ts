import { z } from 'zod'

export type PharmacyConsultationStatus =
  | 'pending'
  | 'assigned'
  | 'in_call'
  | 'completed'
  | 'cancelled'
  | 'expired'

export interface PharmacyConsultationRequest {
  id: string
  pharmacy_id: string | null
  pharmacy_name: string
  patient_dni: string
  patient_name: string
  patient_phone: string
  reason: string
  status: PharmacyConsultationStatus
  doctor_id: string | null
  call_id: string | null
  room_id: string | null
  guest_invite_id: string | null
  created_at: string
  assigned_at: string | null
  completed_at: string | null
  metadata: Record<string, unknown>
}

export interface DoctorOnDutySession {
  id: string
  doctor_id: string
  status: 'active' | 'paused' | 'ended'
  started_at: string
  last_heartbeat_at: string
  ended_at: string | null
  metadata: Record<string, unknown>
}

export interface DoctorOnDutyStatus {
  onDuty: boolean
  since: string | null
  activeSessionId: string | null
  waitingQueueCount: number
}

export interface OnDemandQueueItem {
  id: string
  pharmacyId: string | null
  pharmacyName: string
  patientDni: string
  patientName: string
  patientPhone: string
  reason: string
  status: PharmacyConsultationStatus
  createdAt: string
  minutesWaiting: number
}

export interface AssignedDoctorInfo {
  id: string
  name: string
  specialty: string
  licenseNumber: string
}

export interface RequestStatusResponse {
  id: string
  status: PharmacyConsultationStatus
  queuePosition: number
  pharmacyName: string
  patientName: string
  reason: string
  roomId: string | null
  guestInviteId: string | null
  patientJoinUrl: string | null
  doctor: AssignedDoctorInfo | null
  createdAt: string
  assignedAt: string | null
}

export interface ClaimConsultationResult {
  requestId: string
  callId: string
  roomId: string
  guestInviteId: string
  doctorRoomUrl: string
  patientJoinUrl: string
  patient: {
    dni: string
    name: string
    phone: string
    reason: string
    pharmacyName: string
  }
}

export const CreatePharmacyRequestSchema = z.object({
  pharmacyId: z.string().uuid().optional().nullable(),
  pharmacyName: z.string().min(1, 'El nombre de la farmacia es requerido'),
  patientDni: z.string().trim().min(5, 'DNI / Documento inválido'),
  patientName: z.string().trim().min(3, 'Nombre y apellido requeridos'),
  patientPhone: z.string().trim().min(6, 'Teléfono o WhatsApp requerido'),
  reason: z.string().trim().min(3, 'Indique el motivo o medicamento solicitado'),
})

export type CreatePharmacyRequestInput = z.infer<typeof CreatePharmacyRequestSchema>

export const ClaimPharmacyRequestSchema = z.object({
  requestId: z.string().uuid('ID de solicitud inválido'),
})

export type ClaimPharmacyRequestInput = z.infer<typeof ClaimPharmacyRequestSchema>

export const ToggleDoctorOnDutySchema = z.object({
  onDuty: z.boolean(),
})

export type ToggleDoctorOnDutyInput = z.infer<typeof ToggleDoctorOnDutySchema>

export const CompletePharmacyConsultationSchema = z.object({
  requestId: z.string().uuid('ID de solicitud inválido'),
  notes: z.string().optional(),
})

export type CompletePharmacyConsultationInput = z.infer<typeof CompletePharmacyConsultationSchema>
