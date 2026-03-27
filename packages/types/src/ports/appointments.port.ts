/**
 * Port: Appointment Repository
 *
 * Interfaz abstracta para acceso a datos de turnos.
 * Separada en lectura (query) y escritura (command) para facilitar CQRS lite.
 * Usa genéricos para permitir que los repos retornen tipos enriquecidos
 * (ej: AppointmentWithDoctor) sin forzar el tipo base.
 */

import type {
  Appointment,
  AppointmentInsert,
  AppointmentUpdate,
} from '../entities/appointment'

/** Read-only operations — T defaults to Appointment but repos can return enriched types */
export interface IAppointmentQueryRepository<T = Appointment> {
  listByPatient(patientId: string): Promise<T[]>
  listByDoctor(doctorId: string): Promise<T[]>
  findById(id: string): Promise<T | null>
}

/** Write operations */
export interface IAppointmentCommandRepository<T = Appointment> {
  create(patientId: string, input: AppointmentInsert): Promise<T>
  update(id: string, patch: AppointmentUpdate): Promise<T>
  cancel(id: string): Promise<T | null>
}

/** Combined for convenience */
export interface IAppointmentRepository<T = Appointment>
  extends IAppointmentQueryRepository<T>,
    IAppointmentCommandRepository<T> {}
