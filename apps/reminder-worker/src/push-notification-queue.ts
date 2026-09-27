import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@autamedica/shared';

export interface PushQueueProcessOptions {
  batchSize?: number;
  dryRun?: boolean;
}

export interface PushQueueProcessResult {
  processed: number;
  dispatched: number;
  skipped: number;
  failed: number;
  errors: string[];
}

interface QueueItem {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  deep_link: string | null;
  data: Record<string, unknown> | null;
}

export async function processPushNotificationJobs(
  supabase: SupabaseClient,
  options: PushQueueProcessOptions = {}
): Promise<PushQueueProcessResult> {
  const result: PushQueueProcessResult = {
    processed: 0,
    dispatched: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  try {
    const { data: items, error: drainErr } = await supabase.rpc('drain_notification_queue', {
      p_batch_size: options.batchSize ?? 50,
    });

    if (drainErr) {
      result.errors.push(`Failed to drain notification queue: ${drainErr.message}`);
      return result;
    }

    const claimed = Array.isArray(items) ? (items as unknown as QueueItem[]) : [];
    if (claimed.length === 0) {
      return result;
    }

    const supabaseUrl = process.env.SUPABASE_URL ?? '';

    for (const item of claimed) {
      result.processed += 1;

      try {
        if (options.dryRun) {
          // Claimed items were already moved to 'processing'; release them back.
          const { error: releaseErr } = await supabase
            .from('notification_queue')
            .update({ status: 'pending' })
            .eq('id', item.id);
          if (releaseErr) {
            result.errors.push(`[PushQueue] dry-run release failed for ${item.id}: ${releaseErr.message}`);
          }
          result.skipped += 1;
          continue;
        }

        if (!supabaseUrl) {
          const { error: failErr } = await supabase
            .from('notification_queue')
            .update({
              status: 'failed',
              last_error: 'SUPABASE_URL configurada',
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id);
          if (failErr) {
            result.errors.push(`[PushQueue] mark-failed failed for ${item.id}: ${failErr.message}`);
          }
          result.failed += 1;
          continue;
        }

        const data: Record<string, string> = {
          type: item.type,
          title: item.title,
          body: item.body,
        };
        if (item.deep_link) data.deep_link = item.deep_link;
        for (const [key, value] of Object.entries(item.data ?? {})) {
          if (value != null) data[key] = String(value);
        }

        const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`,
          },
          body: JSON.stringify({
            userId: item.user_id,
            title: item.title,
            body: item.body,
            data,
          }),
        });

        const ok = pushRes.ok;
        const pushBody = await pushRes.json().catch(() => null) as { success?: boolean; error?: string } | null;
        const dispatchSucceeded = ok && pushBody?.success !== false;

        if (dispatchSucceeded) {
          const { error: sentErr } = await supabase
            .from('notification_queue')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              last_error: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id);
          if (sentErr) {
            result.errors.push(`[PushQueue] mark-sent failed for ${item.id}: ${sentErr.message}`);
          }
          result.dispatched += 1;
        } else {
          const { error: failErr } = await supabase
            .from('notification_queue')
            .update({
              status: 'failed',
              last_error: JSON.stringify(pushBody ?? { status: pushRes.status }),
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id);
          if (failErr) {
            result.errors.push(`[PushQueue] mark-failed failed for ${item.id}: ${failErr.message}`);
          }
          result.failed += 1;
          result.errors.push(`[PushQueue] send failed for ${item.id}: ${pushBody?.error ?? `HTTP ${pushRes.status}`}`);
        }
      } catch (err) {
        result.failed += 1;
        result.errors.push(`[PushQueue] item ${item.id} error: ${(err as Error).message}`);
        const { error: failErr } = await supabase
          .from('notification_queue')
          .update({
            status: 'failed',
            last_error: (err as Error).message,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id);
        if (failErr) {
          result.errors.push(`[PushQueue] mark-failed failed for ${item.id}: ${failErr.message}`);
        }
      }
    }

    logger.info('[PushQueue] cycle done', {
      processed: result.processed,
      dispatched: result.dispatched,
      failed: result.failed,
      skipped: result.skipped,
    });

    return result;
  } catch (err) {
    result.errors.push(`[PushQueue] unexpected error: ${(err as Error).message}`);
    return result;
  }
}