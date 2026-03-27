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
