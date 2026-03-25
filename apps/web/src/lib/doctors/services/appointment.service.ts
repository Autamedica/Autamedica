/**
 * Frontend Service: Appointment Business Logic
 * Resolves patient names and other appointment-related derivations.
 * Layer 3 of 7-layer architecture.
 * Pure functions, no React imports.
 */
import { getBrowserSupabaseClient } from '@/lib/supabase-browser';
import { logger } from '@autamedica/shared';

interface PatientRow {
  user_id: string | null;
}

interface ProfileRow {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
}

/**
 * Resolve a map of patientId → display name for a list of patient IDs.
 * Queries patients → profiles join to get first/last name.
 */
export async function resolvePatientNameMap(patientIds: string[]): Promise<Record<string, string>> {
  if (patientIds.length === 0) return {};

  try {
    const supabase = getBrowserSupabaseClient();

    const { data: patients } = await supabase
      .from('patients')
      .select('id, user_id')
      .in('id', patientIds);

    if (!patients?.length) return {};

    const userIds = patients.map((p: { id: string; user_id: string | null }) => p.user_id).filter(Boolean);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, first_name, last_name')
      .in('user_id', userIds);

    if (!profiles?.length) return {};

    const userToName: Record<string, string> = {};
    for (const p of profiles) {
      const prof = p as ProfileRow;
      userToName[prof.user_id] = `${prof.first_name || ''} ${prof.last_name || ''}`.trim() || 'Paciente';
    }

    const nameMap: Record<string, string> = {};
    for (const patient of patients) {
      const pat = patient as PatientRow & { id: string };
      if (pat.user_id && userToName[pat.user_id]) {
        nameMap[pat.id] = userToName[pat.user_id];
      }
    }

    return nameMap;
  } catch (err) {
    logger.error('[resolvePatientNameMap] failed', err);
    return {};
  }
}
