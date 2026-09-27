import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  IRndsEvidenceRepository,
  RndsEvidenceRecord,
} from '../types/evidence.types';

/**
 * Persiste evidencia de integracion RNDS en `rnds_integration_events`.
 * El payload debe llegar sanitizado (sin PII); esta capa nunca agrega datos.
 */
export class SupabaseRndsEvidenceRepository implements IRndsEvidenceRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async save(record: Omit<RndsEvidenceRecord, 'id' | 'createdAt'>): Promise<void> {
    const { error } = await this.supabase.from('rnds_integration_events').insert({
      domain: record.domain,
      direction: record.direction,
      environment: record.environment,
      status: record.status,
      sanitized_payload: record.sanitizedPayload,
      rnds_identifier: record.rndsIdentifier,
      reference_id: record.referenceId,
      error_code: record.errorCode,
    });

    if (error) {
      throw new Error(`rnds_evidence_save_failed:${error.message}`);
    }
  }
}