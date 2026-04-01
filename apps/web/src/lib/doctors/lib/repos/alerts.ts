import { getBrowserSupabaseClient } from '@/lib/supabase-browser';
import { toCamel, logger } from '@autamedica/shared';
import type { Tables } from '@autamedica/types';

export type Alert = Tables<'patient_alerts'>;

export async function getAlertsForPatients(patientIds: string[]): Promise<Alert[]> {
  const { data, error } = await getBrowserSupabaseClient()
    .from('patient_alerts')
    .select('*')
    .in('patient_id', patientIds);

  if (error) {
    logger.error('[alerts repo] getAlertsForPatients failed', error);
    throw error;
  }

  return toCamel<Alert[]>(data ?? []);
}
