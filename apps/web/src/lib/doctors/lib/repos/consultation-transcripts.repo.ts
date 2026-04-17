/**
 * Layer 2: Repository — Consultation Transcripts
 * Only this file talks to Supabase for the consultation_transcripts table.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@autamedica/shared';

type Client = SupabaseClient;

export interface TranscriptSegment {
  speaker: 'local' | 'remote';
  text: string;
  timestamp: number;
  isFinal: boolean;
}

export interface InsertTranscriptInput {
  roomId: string;
  doctorId: string;
  patientId: string;
  appointmentId: string | null;
  segments: TranscriptSegment[];
  fullText: string;
  durationSeconds: number | null;
  wordCount: number;
  consentDoctor: boolean;
  consentPatient: boolean;
  lang: string;
}

export const consultationTranscriptsRepo = {
  async insert(admin: Client, input: InsertTranscriptInput): Promise<void> {
    const { error } = await admin
      .from('consultation_transcripts')
      .insert({
        room_id: input.roomId,
        doctor_id: input.doctorId,
        patient_id: input.patientId,
        appointment_id: input.appointmentId,
        segments: input.segments as unknown as Record<string, unknown>[],
        full_text: input.fullText,
        duration_seconds: input.durationSeconds,
        word_count: input.wordCount,
        consent_doctor: input.consentDoctor,
        consent_patient: input.consentPatient,
        lang: input.lang,
      });

    if (error) {
      logger.error('[consultationTranscriptsRepo] insert failed', error);
      throw error;
    }
  },
};
