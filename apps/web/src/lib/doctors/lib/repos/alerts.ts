import { getBrowserSupabaseClient } from '@/lib/supabase-browser';
import { toCamel, logger } from '@autamedica/shared';
import type { Tables, Database } from '@autamedica/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export type Alert = Tables<'patient_alerts'>;

export async function getAlertsForPatients(
  patientIds: string[],
  client: SupabaseClient<Database> = getBrowserSupabaseClient(),
): Promise<Alert[]> {
  if (patientIds.length === 0) return [];

  const { data, error } = await client
    .from('patient_alerts')
    .select('*')
    .in('patient_id', patientIds);

  if (error) {
    logger.error('[alerts repo] getAlertsForPatients failed', error);
    throw error;
  }

  return toCamel<Alert[]>(data ?? []);
}
