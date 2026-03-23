// Re-exports from canonical location for backward compatibility
// Canonical definitions live in core/brand.types.ts
export type { UUID, PatientId, DoctorId, AppointmentId, FacilityId } from './core/brand.types';

// SpecialtyId only exists here (legacy)
import type { Brand } from './core/brand.types';
export type SpecialtyId = Brand<string, 'SpecialtyId'>;
