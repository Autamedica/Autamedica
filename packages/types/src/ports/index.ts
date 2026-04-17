/**
 * Ports — Interfaces abstractas de repositorios y servicios.
 *
 * Define contratos que la capa de infraestructura (Supabase adapters) implementa.
 * Permite inyección de dependencias y testing con mocks.
 *
 * @example
 * // En un use case:
 * import type { IPatientRepository } from '@autamedica/types/ports'
 *
 * export async function getPatientDashboard(
 *   deps: { patients: IPatientRepository },
 *   patientId: string
 * ) { ... }
 */

export type { IPatientRepository } from './patients.port'
export type {
  IAppointmentRepository,
  IAppointmentQueryRepository,
  IAppointmentCommandRepository,
} from './appointments.port'
export type {
  IAnamnesisRepository,
  AnamnesisEntity,
  AnamnesisSectionEntity,
} from './anamnesis.port'
export type {
  IDoctorRepository,
  MarkOnboardingCompleteInput,
} from './doctors.port'
export type {
  IMedicalRecordsRepository,
  MedicalRecordView,
  MedicalRecordInsertInput,
  MedicalRecordUpdateInput,
} from './medical-records.port'
export type { IAlertsRepository, AlertEntity } from './alerts.port'
export type {
  IAppointmentReadRepository,
  AppointmentView,
} from './appointment-read.port'
