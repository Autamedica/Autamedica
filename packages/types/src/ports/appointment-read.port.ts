/**
 * Port: Appointment Read Repository (browser-facing)
 *
 * Interfaz abstracta para operaciones de lectura/escritura de turnos
 * en el contexto de browser (appointments.ts repo).
 * Complementa IAppointmentCommandRepository que es doctor-scoped.
 */

export interface AppointmentView {
  id: string
  patientId: string
  doctorId: string
  startTime: string
  durationMinutes: number
  status: string
  type: string
  notes: string | null
  active: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface IAppointmentReadRepository {
  list(): Promise<AppointmentView[]>
  findById(id: string): Promise<AppointmentView | null>
  update(id: string, patch: Record<string, unknown>): Promise<AppointmentView>
}
