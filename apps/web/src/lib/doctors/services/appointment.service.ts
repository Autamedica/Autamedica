/**
 * Frontend Service: Appointment Business Logic
 * Resolves patient names and other appointment-related derivations.
 * Layer 3 of 7-layer architecture.
 * Pure functions, no React imports.
 */
import { fetchApi } from '@/lib/api-client';
import { logger } from '@autamedica/shared';

/**
 * Resolve a map of patientId → display name for a list of patient IDs.
 * Uses a doctor-authenticated internal API to avoid browser-side Supabase drift.
 */
export async function resolvePatientNameMap(patientIds: string[]): Promise<Record<string, string>> {
  if (patientIds.length === 0) return {};

  try {
    return await fetchApi<Record<string, string>>('/api/doctors/patients/names', {
      method: 'POST',
      body: { patientIds },
    });
  } catch (err) {
    logger.error('[resolvePatientNameMap] failed', err);
    return {};
  }
}
