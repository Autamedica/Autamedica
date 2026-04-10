import { supabase } from '@/lib/supabase/client';
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
  segment?: SegmentKey;
  rawText: string;
  normalizedText?: string;
  extractedFields?: Record<string, unknown>;
  plannerOutput?: unknown;
  promptSnapshotText?: string;
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
  channel: 'voice' | 'text';
  segment?: SegmentKey;
  raw_text: string;
  normalized_text?: string;
  extracted_fields?: Record<string, unknown>;
  planner_output?: unknown;
  prompt_snapshot_text?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export class ConversationLedgerAdapter {
  async createSession(session: Omit<ConversationSession, 'id' | 'startedAt'>): Promise<ConversationSession> {
    const { data, error } = await supabase
      .from('conversation_sessions')
      .insert({
        patient_id: session.patientId,
        case_id: session.caseId,
        channel: session.channel,
        workflow_type: session.workflowType,
        status: session.status,
      })
      .select()
      .single();

    if (error) throw error;
    
    return this.mapSession(data);
  }

  async closeSession(sessionId: string, status: 'closed' | 'failed'): Promise<void> {
    const { error } = await supabase
      .from('conversation_sessions')
      .update({
        status,
        ended_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (error) throw error;
  }

  async logEvent(event: Omit<ConversationEvent, 'id' | 'createdAt'>): Promise<ConversationEvent> {
    const { data, error } = await supabase
      .from('conversation_events')
      .insert({
        session_id: event.sessionId,
        case_id: event.caseId,
        patient_id: event.patientId,
        role: event.role,
        channel: event.channel,
        segment: event.segment,
        raw_text: event.rawText,
        normalized_text: event.normalizedText,
        extracted_fields: event.extractedFields,
        planner_output: event.plannerOutput,
        prompt_snapshot_text: event.promptSnapshotText,
        metadata: event.metadata,
      })
      .select()
      .single();

    if (error) throw error;

    return this.mapEvent(data);
  }

  async getEventsForSession(sessionId: string): Promise<ConversationEvent[]> {
    const { data, error } = await supabase
      .from('conversation_events')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return data.map(this.mapEvent);
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
      segment: dbRecord.segment as SegmentKey | undefined,
      rawText: dbRecord.raw_text,
      normalizedText: dbRecord.normalized_text,
      extractedFields: dbRecord.extracted_fields,
      plannerOutput: dbRecord.planner_output,
      promptSnapshotText: dbRecord.prompt_snapshot_text,
      metadata: dbRecord.metadata,
      createdAt: dbRecord.created_at,
    };
  }
}

export const conversationLedgerAdapter = new ConversationLedgerAdapter();
