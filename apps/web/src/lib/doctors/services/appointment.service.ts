/**
 * Frontend Service: Appointment Business Logic
 * Resolves patient names and other appointment-related derivations.
 * Layer 3 of 7-layer architecture.
 * Pure functions, no React imports.
 */
import { fetchApi } from '@/lib/api-client';
import { logger } from '@autamedica/shared';
import type { Appointment } from '@autamedica/types';

/**
 * Resolve a map of appointmentId → display name for a list of appointments.
 * Handles both regular patients (via ID) and guest patients (via notes).
 */
export async function resolvePatientNameMap(appointments: Appointment[]): Promise<Record<string, string>> {
  if (appointments.length === 0) return {};

  const patientIds = appointments
    .map(a => a.patient_id)
    .filter((id): id is NonNullable<typeof id> => !!id);

  const result: Record<string, string> = {};

  // Initialize result with guest names from notes
  for (const appt of appointments) {
    if (!appt.patient_id && appt.notes?.includes('[INVITADO:')) {
      const match = appt.notes.match(/\[INVITADO:\s*([^\]]+)\]/);
      if (match?.[1]) {
        result[appt.id] = match[1].trim();
      }
    }
  }

  if (patientIds.length === 0) return result;

  try {
    const namesMap = await fetchApi<Record<string, string>>('/api/doctors/patients/names', {
      method: 'POST',
      body: { patientIds },
    });

    // Merge namesMap into result, matching by appointment.id
    for (const appt of appointments) {
      if (appt.patient_id && namesMap[appt.patient_id]) {
        result[appt.id] = namesMap[appt.patient_id];
      }
    }

    return result;
  } catch (err) {
    logger.error('[resolvePatientNameMap] failed', err);
    return result;
  }
}
