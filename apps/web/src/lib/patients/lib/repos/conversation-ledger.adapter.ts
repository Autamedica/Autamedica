import type { SupabaseClient } from '@supabase/supabase-js';
import type { SegmentKey, WorkflowType } from '../../clinical-state/types';

export interface ConversationSession {
  id: string;
  patientId: string;
  caseId: string;
  channel: 'voice' | 'chat';
  workflowType: WorkflowType;
  status: 'active' | 'closed' | 'failed';
  startedAt: string;
  endedAt?: string;
}

export interface ConversationEvent {
  id: string;
  sessionId: string;
  caseId: string;
  patientId: string;
  role: 'patient' | 'assistant' | 'system';
  channel: 'voice' | 'text';
  eventType: string;
  segment?: SegmentKey;
  rawText: string;
  normalizedText?: string;
  extractedFields?: Record<string, unknown>;
  plannerOutput?: unknown;
  promptSnapshotText?: string;
  modelName?: string;
  modelVersion?: string;
  extractionConfidence?: string;
  latencyMs?: number;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

type DbConversationSessionRecord = {
  id: string;
  patient_id: string;
  case_id: string;
  channel: 'voice' | 'chat';
  workflow_type: WorkflowType;
  status: 'active' | 'closed' | 'failed';
  started_at: string;
  ended_at?: string;
}

type DbConversationEventRecord = {
  id: string;
  session_id: string;
  case_id: string;
  patient_id: string;
  role: 'patient' | 'assistant' | 'system';
  event_type: string;
  channel: 'voice' | 'text';
  segment?: SegmentKey;
  raw_text: string;
  normalized_text?: string;
  extracted_fields?: Record<string, unknown>;
  planner_output?: unknown;
  prompt_snapshot_text?: string;
  model_name?: string;
  model_version?: string;
  extraction_confidence?: string;
  latency_ms?: number;
  error_code?: string;
  error_message?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export class ConversationLedgerAdapter {
  constructor(private supabase: SupabaseClient) {}

  async createSession(session: Omit<ConversationSession, 'id' | 'startedAt'>): Promise<ConversationSession> {
    const payload = {
      patient_id: session.patientId,
      case_id: session.caseId,
      channel: session.channel,
      workflow_type: session.workflowType,
      status: session.status,
    }

    const { data, error } = await this.supabase
      .from('conversation_sessions')
      .insert(payload)
      .select()
      .single();

    if (error?.code === '23505') {
      const { data: existing, error: existingError } = await this.supabase
        .from('conversation_sessions')
        .select('*')
        .match(payload)
        .eq('status', 'active')
        .maybeSingle();

      if (existingError) throw existingError;
      if (existing) {
        return this.mapSession(existing as unknown as DbConversationSessionRecord);
      }
    }

    if (error) throw error;

    return this.mapSession(data as unknown as DbConversationSessionRecord);
  }

  async closeSession(sessionId: string, status: 'closed' | 'failed'): Promise<void> {
    const { error } = await this.supabase
      .from('conversation_sessions')
      .update({
        status,
        ended_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (error) throw error;
  }

  async logEvent(event: Omit<ConversationEvent, 'id' | 'createdAt'>): Promise<ConversationEvent> {
    // 1. Obtener el siguiente sequence_number si no se provee
    let sequenceNumber = (event as Record<string, unknown>).sequenceNumber as number | undefined;
    
    if (sequenceNumber === undefined) {
      const { count } = await this.supabase
        .from('conversation_events')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', event.sessionId);
      
      sequenceNumber = (count ?? 0) + 1;
    }

    const { data, error } = await this.supabase
      .from('conversation_events')
      .insert({
        session_id: event.sessionId,
        case_id: event.caseId,
        patient_id: event.patientId,
        sequence_number: sequenceNumber,
        role: event.role,
        event_type: event.eventType,
        channel: event.channel,
        segment: event.segment,
        raw_text: event.rawText,
        normalized_text: event.normalizedText,
        extracted_fields: event.extractedFields,
        planner_output: event.plannerOutput,
        prompt_snapshot_text: event.promptSnapshotText,
        model_name: event.modelName,
        model_version: event.modelVersion,
        extraction_confidence: event.extractionConfidence,
        latency_ms: event.latencyMs,
        error_code: event.errorCode,
        error_message: event.errorMessage,
        metadata: event.metadata,
      })
      .select()
      .single();

    if (error) {
      console.error('[ConversationLedgerAdapter] logEvent failed', error);
      throw error;
    }

    return this.mapEvent(data as unknown as DbConversationEventRecord);
  }

  async getEventsForSession(sessionId: string): Promise<ConversationEvent[]> {
    const { data, error } = await this.supabase
      .from('conversation_events')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return (data as unknown as DbConversationEventRecord[]).map((e) => this.mapEvent(e));
  }

  // ----------- Mappers -----------
  private mapSession(dbRecord: DbConversationSessionRecord): ConversationSession {
    return {
      id: dbRecord.id,
      patientId: dbRecord.patient_id,
      caseId: dbRecord.case_id,
      channel: dbRecord.channel,
      workflowType: dbRecord.workflow_type,
      status: dbRecord.status,
      startedAt: dbRecord.started_at,
      endedAt: dbRecord.ended_at,
    };
  }

  private mapEvent(dbRecord: DbConversationEventRecord): ConversationEvent {
    return {
      id: dbRecord.id,
      sessionId: dbRecord.session_id,
      caseId: dbRecord.case_id,
      patientId: dbRecord.patient_id,
      role: dbRecord.role,
      channel: dbRecord.channel,
      eventType: dbRecord.event_type,
      segment: dbRecord.segment as SegmentKey | undefined,
      rawText: dbRecord.raw_text,
      normalizedText: dbRecord.normalized_text,
      extractedFields: dbRecord.extracted_fields,
      plannerOutput: dbRecord.planner_output,
      promptSnapshotText: dbRecord.prompt_snapshot_text,
      modelName: dbRecord.model_name,
      modelVersion: dbRecord.model_version,
      extractionConfidence: dbRecord.extraction_confidence,
      latencyMs: dbRecord.latency_ms,
      errorCode: dbRecord.error_code,
      errorMessage: dbRecord.error_message,
      metadata: dbRecord.metadata,
      createdAt: dbRecord.created_at,
    };
  }
}

export const createConversationLedgerAdapter = (supabase: SupabaseClient) => new ConversationLedgerAdapter(supabase);
