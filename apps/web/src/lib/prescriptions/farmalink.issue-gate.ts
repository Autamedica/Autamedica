import type { SupabaseClient } from '@supabase/supabase-js';

export type FarmalinkAttemptState = 'reserved' | 'unknown' | 'rejected' | 'confirmed';

export interface FarmalinkIssueClaim {
  claimed: boolean;
  attempt_id: string;
  state: FarmalinkAttemptState;
}

export type FarmalinkPersistResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'database_failure' | 'unexpected_result' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reserve exactly one Farmalink alta for a prescription.
 * The database RPC must commit before any network request to Farmalink.
 * Fail closed if the migration/function is absent or the request times out.
 */
export async function claimFarmalinkIssue(
  supabase: SupabaseClient,
  prescriptionId: string,
  requestSha256: string,
  actorUserId: string,
  expectedClinicalData: unknown = null,
): Promise<FarmalinkPersistResult<FarmalinkIssueClaim>> {
  try {
    const { data, error } = await supabase.rpc('claim_farmalink_issue', {
      p_prescription_id: prescriptionId,
      p_request_sha256: requestSha256,
      p_actor_user_id: actorUserId,
      p_expected_clinical_data: expectedClinicalData,
    });

    if (error) return { ok: false, reason: 'database_failure' };
    if (
      !data || typeof data !== 'object' || Array.isArray(data)
      || typeof data.claimed !== 'boolean'
      || typeof data.attempt_id !== 'string' || !UUID_RE.test(data.attempt_id)
      || !['reserved', 'unknown', 'rejected', 'confirmed'].includes(data.state)
      || (data.claimed && data.state !== 'reserved')
    ) return { ok: false, reason: 'unexpected_result' };

    return { ok: true, value: data as unknown as FarmalinkIssueClaim };
  } catch {
    return { ok: false, reason: 'database_failure' };
  }
}

/**
 * Persist the result BEFORE PDF generation. Any ambiguous network failure is
 * stored as 'unknown'; even explicit rejection requires manual reconciliation
 * before another alta is permitted for that prescription.
 */
export async function recordFarmalinkIssue(
  supabase: SupabaseClient,
  prescriptionId: string,
  attemptId: string,
  actorUserId: string,
  state: Exclude<FarmalinkAttemptState, 'reserved'>,
  vendorId?: string,
  responseCode?: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('record_farmalink_issue', {
      p_prescription_id: prescriptionId,
      p_attempt_id: attemptId,
      p_state: state,
      p_actor_user_id: actorUserId,
      p_vendor_id: state === 'confirmed' ? vendorId : null,
      p_response_code: responseCode ?? null,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

