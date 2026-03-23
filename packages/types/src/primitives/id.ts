/**
 * Re-exports from canonical location (core/brand.types)
 * Kept for backward compatibility with existing consumers
 */

export type {
  UUID,
  PatientId,
  DoctorId,
  CompanyId,
  OrganizationId,
  AppointmentId,
  FacilityId,
  UserId,
} from '../core/brand.types';

import type { Brand } from '../core/brand.types';

// SpecialtyId only defined here (not in brand.types)
export type SpecialtyId = Brand<string, 'SpecialtyId'>;

// Legacy helper functions
import type { UUID, PatientId, DoctorId, CompanyId, OrganizationId } from '../core/brand.types';

export function createUUID(id: string): UUID {
  return id as UUID;
}

export function createPatientId(id: string): PatientId {
  return id as unknown as PatientId;
}

export function createDoctorId(id: string): DoctorId {
  return id as unknown as DoctorId;
}

export function createCompanyId(id: string): CompanyId {
  return id as unknown as CompanyId;
}

export function createOrganizationId(id: string): OrganizationId {
  return id as unknown as OrganizationId;
}
