import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@autamedica/shared';

export interface OutboxProcessOptions {
  batchSize?: number;
  dryRun?: boolean;
}

export interface OutboxProcessResult {
  processed: number;
  dispatched: number;
  skipped: number;
  failed: number;
  errors: string[];
}

type ClinicalSetting = 'uti' | 'guardia' | 'ward' | 'outpatient';
type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';
type AlarmRoute = 'shockroom' | 'icu_bedside' | 'triage_queue' | 'ward_rounds' | 'outpatient_followup';

export interface ClinicalAlarmPolicy {
  route: AlarmRoute;
  priority: 1 | 2 | 3 | 4;
  dedupeWindowMs: number;
  expectedActionWindowMinutes: number;
}

interface OutboxEvent {
  id: string;
  event_type: string;
  payload: {
    execution_id: string;
    rule_version_id: string;
    incident_id: string;
    patient_id: string;
    doctor_id: string;
    evidence_used: any;
    recommendation: string;
    reason: string;
    override_id: string | null;
    override_reason: string | null;
    authorized_by: string | null;
  };
  status: 'pending' | 'processed' | 'failed';
  retry_count: number;
  error_message: string | null;
}

const MINUTE_MS = 60 * 1000;

// In-memory cache to prevent duplicate alerts within a setting-specific window.
const recentlyDispatchedAlarms = new Map<string, number>();

/**
 * Cleans up expired items in the idempotency cache.
 */
function cleanupIdempotencyCache() {
  const now = Date.now();
  for (const [key, timestamp] of recentlyDispatchedAlarms.entries()) {
    if (now - timestamp > 4 * 60 * MINUTE_MS) {
      recentlyDispatchedAlarms.delete(key);
    }
  }
}

export function resolveClinicalAlarmPolicy(
  setting: ClinicalSetting,
  severity: IncidentSeverity
): ClinicalAlarmPolicy {
  if (setting === 'uti') {
    return severity === 'critical'
      ? { route: 'icu_bedside', priority: 1, dedupeWindowMs: 1 * MINUTE_MS, expectedActionWindowMinutes: 1 }
      : { route: 'icu_bedside', priority: 2, dedupeWindowMs: 5 * MINUTE_MS, expectedActionWindowMinutes: 5 };
  }

  if (setting === 'guardia') {
    return severity === 'critical'
      ? { route: 'shockroom', priority: 1, dedupeWindowMs: 2 * MINUTE_MS, expectedActionWindowMinutes: 10 }
      : { route: 'triage_queue', priority: 2, dedupeWindowMs: 10 * MINUTE_MS, expectedActionWindowMinutes: 30 };
  }

  if (setting === 'ward') {
    return severity === 'critical' || severity === 'high'
      ? { route: 'ward_rounds', priority: 2, dedupeWindowMs: 30 * MINUTE_MS, expectedActionWindowMinutes: 60 }
      : { route: 'ward_rounds', priority: 3, dedupeWindowMs: 60 * MINUTE_MS, expectedActionWindowMinutes: 240 };
  }

  return severity === 'critical' || severity === 'high'
    ? { route: 'outpatient_followup', priority: 3, dedupeWindowMs: 2 * 60 * MINUTE_MS, expectedActionWindowMinutes: 24 * 60 }
    : { route: 'outpatient_followup', priority: 4, dedupeWindowMs: 4 * 60 * MINUTE_MS, expectedActionWindowMinutes: 7 * 24 * 60 };
}

/**
 * Generates a unique, clinical alarm idempotency key.
 * Structure: incident_id + rule_version_id + trigger_type + setting_policy_window
 */
export function generateAlarmIdempotencyKey(
  incidentId: string,
  ruleVersionId: string,
  triggerType: string,
  dedupeWindowMs = 60 * MINUTE_MS,
  now = new Date()
): string {
  const timeWindow = Math.floor(now.getTime() / dedupeWindowMs);
  return `${incidentId}:${ruleVersionId}:${triggerType}:${timeWindow}`;
}

/**
 * Polls, deduplicates, and dispatches clinical safety alerts from the transactional outbox.
 */
export async function processClinicalOutboxJobs(
  supabase: SupabaseClient,
  options: OutboxProcessOptions = {}
): Promise<OutboxProcessResult> {
  const result: OutboxProcessResult = {
    processed: 0,
    dispatched: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  cleanupIdempotencyCache();

  try {
    // 1. Fetch pending outbox events from the DB
    const { data: events, error: fetchErr } = await supabase
      .from('clinical_outbox_events')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(options.batchSize ?? 25);

    if (fetchErr) {
      result.errors.push(`Failed to fetch pending outbox events: ${fetchErr.message}`);
      return result;
    }

    if (!events || events.length === 0) {
      return result;
    }

    for (const rawEvent of events) {
      const event = rawEvent as unknown as OutboxEvent;
      result.processed += 1;

      try {
        const { incident_id, rule_version_id, recommendation, reason } = event.payload;

        // 2. Fetch clinical incident setting and severity details for proper alert routing
        const { data: incident, error: incidentErr } = await supabase
          .from('clinical_incidents')
          .select('setting, severity, condition_display')
          .eq('id', incident_id)
          .maybeSingle();

        if (incidentErr) {
          logger.error(`[ClinicalOutboxWorker] Failed to fetch incident ${incident_id}`, incidentErr);
        }

        const setting = (incident?.setting ?? 'outpatient') as ClinicalSetting;
        const severity = (incident?.severity ?? 'medium') as IncidentSeverity;
        const conditionDisplay = incident?.condition_display ?? 'Condición clínica';
        const alarmPolicy = resolveClinicalAlarmPolicy(setting, severity);

        // 3. Formulate the Idempotency Key
        const idempotencyKey = generateAlarmIdempotencyKey(
          incident_id,
          rule_version_id,
          event.event_type,
          alarmPolicy.dedupeWindowMs
        );

        // 4. Verify in cache to prevent duplicate alerts (Alarm Fatigue Prevention)
        const lastDispatched = recentlyDispatchedAlarms.get(idempotencyKey);
        if (lastDispatched && Date.now() - lastDispatched < alarmPolicy.dedupeWindowMs) {
          logger.info(`[ClinicalOutboxWorker] Skipping duplicate clinical alarm (idempotency key match)`, {
            idempotencyKey,
            eventId: event.id,
            route: alarmPolicy.route,
            dedupeWindowMs: alarmPolicy.dedupeWindowMs,
          });

          // Mark outbox event as processed (it was skipped intentionally due to idempotency)
          const { error: skipUpdateErr } = await supabase
            .from('clinical_outbox_events')
            .update({
              status: 'processed',
              processed_at: new Date().toISOString(),
              error_message: 'Skipped due to alarm idempotency rules.',
            })
            .eq('id', event.id);

          if (skipUpdateErr) {
            result.errors.push(`Failed to update skipped status for event ${event.id}: ${skipUpdateErr.message}`);
          }

          result.skipped += 1;
          continue;
        }

        // 5. Route and Broadcast Alert depending on severity and clinical setting
        if (options.dryRun) {
          logger.info(`[ClinicalOutboxWorker] DRY RUN: Would dispatch alert for event ${event.id}`, {
            idempotencyKey,
            setting,
            severity,
            route: alarmPolicy.route,
            priority: alarmPolicy.priority,
            expectedActionWindowMinutes: alarmPolicy.expectedActionWindowMinutes,
            recommendation,
          });
        } else {
          // Simulate direct alarm system / pager broadcast as described in Section 7 of the design doc
          logger.warn(`[ClinicalOutboxWorker] BROADCAST ALARM DISPATCHED: [P${alarmPolicy.priority}] [${alarmPolicy.route}]`, {
            idempotencyKey,
            incidentId: incident_id,
            diagnosis: conditionDisplay,
            setting,
            severity,
            expectedActionWindowMinutes: alarmPolicy.expectedActionWindowMinutes,
            recommendation,
            reason,
          });

          // Record in idempotency cache
          recentlyDispatchedAlarms.set(idempotencyKey, Date.now());
        }

        // 6. Mark outbox event as successfully processed in database
        const { error: updateErr } = await supabase
          .from('clinical_outbox_events')
          .update({
            status: 'processed',
            processed_at: new Date().toISOString(),
            error_message: null,
          })
          .eq('id', event.id);

        if (updateErr) {
          logger.error(`[ClinicalOutboxWorker] Failed to update outbox event ${event.id} to processed`, updateErr);
          result.errors.push(`Failed to update outbox event ${event.id}: ${updateErr.message}`);
          result.failed += 1;
        } else {
          result.dispatched += 1;
        }

      } catch (procErr) {
        const errorMsg = procErr instanceof Error ? procErr.message : 'Unknown processing error';
        logger.error(`[ClinicalOutboxWorker] Event ${event.id} processing crashed`, procErr);

        const nextRetry = event.retry_count + 1;
        const finalStatus = nextRetry >= 3 ? 'failed' : 'pending';

        const { error: failUpdateErr } = await supabase
          .from('clinical_outbox_events')
          .update({
            status: finalStatus,
            retry_count: nextRetry,
            error_message: errorMsg,
          })
          .eq('id', event.id);

        if (failUpdateErr) {
          result.errors.push(`Failed to update failure state for event ${event.id}: ${failUpdateErr.message}`);
        }

        result.errors.push(`Event ${event.id} crashed: ${errorMsg}`);
        result.failed += 1;
      }
    }

  } catch (globalErr) {
    const errorMsg = globalErr instanceof Error ? globalErr.message : 'Global outbox processing error';
    logger.error('[ClinicalOutboxWorker] Global runner failure', globalErr);
    result.errors.push(`Global outbox error: ${errorMsg}`);
  }

  return result;
}
