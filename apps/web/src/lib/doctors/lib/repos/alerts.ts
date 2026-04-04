import { getBrowserSupabaseClient } from '@/lib/supabase-browser';
import { toCamel, logger } from '@autamedica/shared';
import type { Tables, Database, IAlertsRepository } from '@autamedica/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export type Alert = Tables<'patient_alerts'>;

type AlertsClient = SupabaseClient<Database>;

export async function getAlertsForPatients(
  patientIds: string[],
  client: AlertsClient = getBrowserSupabaseClient(),
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

/**
 * Factory: crea un adapter que implementa IAlertsRepository
 * cerrando sobre un SupabaseClient específico.
 * Útil para use cases con inversión de dependencias y testing.
 */
export function createAlertsRepositoryAdapter(
  client: AlertsClient = getBrowserSupabaseClient(),
): IAlertsRepository {
  return {
    getForPatients: (patientIds) => getAlertsForPatients(patientIds, client),
  };
}
