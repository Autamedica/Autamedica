/**
 * Domain Events — Contratos de eventos del dominio AutaMedica
 *
 * Cada key es un evento con su payload tipado.
 * Los use cases emiten eventos; services/handlers se suscriben.
 *
 * Convención de nombres: "entidad.acción_pasada"
 */

export type DomainEvents = {
  // Appointments
  'appointment.scheduled': {
    appointmentId: string
    doctorId: string
    patientId: string
    startTime: string
  }
  'appointment.completed': {
    appointmentId: string
    doctorId: string
    patientId: string
  }
  'appointment.cancelled': {
    appointmentId: string
    cancelledBy: 'doctor' | 'patient'
    reason?: string
  }

  // Anamnesis
  'anamnesis.started': {
    anamnesisId: string
    patientId: string
  }
  'anamnesis.section_completed': {
    anamnesisId: string
    patientId: string
    section: string
  }
  'anamnesis.completed': {
    anamnesisId: string
    patientId: string
  }

  // Teleconsulta
  'call.started': {
    callId: string
    roomId: string
    doctorId: string
    patientId: string
  }
  'call.ended': {
    callId: string
    roomId: string
    durationSeconds: number
  }

  // Informes médicos
  'consultation.report_generated': {
    consultationId: string
    doctorId: string
    patientId: string
    reportUrl?: string
  }

}

export type DomainEventName = keyof DomainEvents
export type DomainEventPayload<K extends DomainEventName> = DomainEvents[K]
