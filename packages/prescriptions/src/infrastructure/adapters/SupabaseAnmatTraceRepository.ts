import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  IAnmatTraceRepository,
  AnmatTraceEvent,
  AnmatTraceStatus,
} from '../../domain/anmat.ports';

interface AnmatRow {
  id: string;
  dispensation_event_id: string;
  gtin: string;
  serie: string;
  lote: string;
  vencimiento: string;
  event_type: AnmatTraceEvent['eventType'];
  anmat_transaction_id: string | null;
  status: AnmatTraceStatus;
  attempt_count: number;
  next_attempt_at: string | null;
  last_error: string | null;
  reported_at: string | null;
  confirmed_at: string | null;
}

function mapRow(row: AnmatRow): AnmatTraceEvent {
  return {
    id: row.id,
    dispensationEventId: row.dispensation_event_id,
    gtin: row.gtin,
    serie: row.serie,
    lote: row.lote,
    vencimiento: row.vencimiento,
    eventType: row.event_type,
    anmatTransactionId: row.anmat_transaction_id ?? undefined,
    status: row.status,
    attemptCount: row.attempt_count,
    nextAttemptAt: row.next_attempt_at ?? undefined,
    lastError: row.last_error ?? undefined,
    reportedAt: row.reported_at ?? undefined,
    confirmedAt: row.confirmed_at ?? undefined,
  };
}

function computeRetryAt(attempt: number): string {
  const minutes = Math.min(5 * 2 ** Math.max(attempt - 1, 0), 240);
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export class SupabaseAnmatTraceRepository implements IAnmatTraceRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async enqueueInform(params: {
    dispensationEventId: string;
    gtin: string;
    serie: string;
    lote: string;
    vencimiento: string;
  }): Promise<AnmatTraceEvent> {
    const { data, error } = await this.supabase
      .from('anmat_trace_events')
      .insert({
        dispensation_event_id: params.dispensationEventId,
        gtin: params.gtin,
        serie: params.serie,
        lote: params.lote,
        vencimiento: params.vencimiento,
        event_type: 'informar_medicamento',
        status: 'pending',
        request_payload: params,
      })
      .select()
      .single();

    if (error?.code === '23505') {
      const { data: existing, error: getError } = await this.supabase
        .from('anmat_trace_events')
        .select('*')
        .eq('dispensation_event_id', params.dispensationEventId)
        .eq('event_type', 'informar_medicamento')
        .eq('gtin', params.gtin)
        .eq('serie', params.serie)
        .single();
      if (getError || !existing) throw new Error(`enqueue anmat existing: ${getError?.message ?? 'no data'}`);
      return mapRow(existing as AnmatRow);
    }

    if (error || !data) throw new Error(`enqueue anmat: ${error?.message ?? 'no data'}`);
    return mapRow(data as AnmatRow);
  }

  async listPending(batchSize: number): Promise<AnmatTraceEvent[]> {
    const nowIso = new Date().toISOString();
    const { data, error } = await this.supabase
      .from('anmat_trace_events')
      .select('*')
      .in('status', ['pending', 'failed'])
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
      .order('created_at', { ascending: true })
      .limit(batchSize);
    if (error) throw new Error(`list pending anmat: ${error.message}`);
    return (data ?? []).map((r) => mapRow(r as AnmatRow));
  }

  async markReported(eventId: string, transactionId: string, response: Record<string, unknown>): Promise<void> {
    const { error } = await this.supabase
      .from('anmat_trace_events')
      .update({
        status: 'reported',
        anmat_transaction_id: transactionId,
        reported_at: new Date().toISOString(),
        response_payload: response,
        last_error: null,
      })
      .eq('id', eventId);
    if (error) throw new Error(`mark reported: ${error.message}`);
  }

  async markConfirmed(eventId: string): Promise<void> {
    const { error } = await this.supabase
      .from('anmat_trace_events')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', eventId);
    if (error) throw new Error(`mark confirmed: ${error.message}`);
  }

  async markFailed(eventId: string, errorMsg: string, nextAttemptAt: string): Promise<void> {
    const { data } = await this.supabase
      .from('anmat_trace_events')
      .select('attempt_count')
      .eq('id', eventId)
      .single();
    const attemptCount = (data?.attempt_count ?? 0) + 1;
    const retryAt = nextAttemptAt ?? computeRetryAt(attemptCount);

    const { error } = await this.supabase
      .from('anmat_trace_events')
      .update({
        status: 'failed',
        attempt_count: attemptCount,
        next_attempt_at: retryAt,
        last_error: errorMsg,
      })
      .eq('id', eventId);
    if (error) throw new Error(`mark failed: ${error.message}`);
  }
}
