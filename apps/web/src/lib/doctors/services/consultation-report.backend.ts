/**
 * Backend Service: Consultation Report Generation and Update
 * Orchestrates repositories and AI services for report workflows.
 * Layer 6 of 7-layer architecture.
 */
import { createAstroAdminClient } from '@/lib/supabase';
import { buildAnamnesisSummary, logger } from '@autamedica/shared';
import { generateConsultationReport } from '@/lib/doctors/services/consultation-report-service';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json, GenerateReportRequest } from '@autamedica/types';
import { resolvePatientProfile } from '@/lib/doctors/lib/resolve-room';

type AdminClient = SupabaseClient;

interface SectionRecord {
  section: string;
  data: Json;
  completed: boolean | null;
  updated_at: string | null;
}

interface ExistingRecord {
  id: string;
  doctor_id: string;
  content: Record<string, unknown>;
}

interface ExtractionCacheRecord {
  extraction_result: unknown;
}

/**
 * Calculate age from date of birth string (YYYY-MM-DD or ISO format).
 */
function calculateAge(dateOfBirth: string): number {
  const birth = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

/**
 * Fetch anamnesis data for a patient if privacy has been accepted.
 * Returns summary text and structured extraction, or null if unavailable.
 */
async function getAnamnesisData(
  admin: AdminClient,
  patientId: string,
): Promise<{
  summaryText: string | null;
  extraction: Record<string, unknown> | null;
} | null> {
  const { data: anamnesisRow } = await admin
    .from('anamnesis')
    .select('id, status, privacy_accepted')
    .eq('patient_id', patientId)
    .is('deleted_at', null)
    .maybeSingle();

  const anamnesis = anamnesisRow as { id: string; status: string; privacy_accepted: boolean | null } | null;

  if (!anamnesis?.privacy_accepted) {
    return null;
  }

  const { data: sectionsRaw } = await admin
    .from('anamnesis_sections')
    .select('section, data, completed, updated_at')
    .eq('anamnesis_id', anamnesis.id)
    .order('updated_at', { ascending: true });

  const sections = (sectionsRaw ?? []) as SectionRecord[];
  let summaryText: string | null = null;

  if (sections.length > 0) {
    const summary = buildAnamnesisSummary(sections);
    summaryText = [summary.headline, ...summary.narrative].join('\n');
  }

  const { data: extractionRow } = await admin
    .from('anamnesis_extractions')
    .select('extraction_result')
    .eq('anamnesis_id', anamnesis.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const extraction = extractionRow
    ? ((extractionRow as ExtractionCacheRecord).extraction_result as Record<string, unknown>)
    : null;

  return { summaryText, extraction };
}

/**
 * Generate and save a new consultation report.
 * Fetches transcription, anamnesis, patient data, generates report via AI, and saves to medical_records.
 */
export async function generateAndSaveReport(
  roomId: string,
  patientId: string,
  doctorId: string,
  appointmentId: string | null,
  doctorNotes: string | null,
): Promise<{
  recordId: string;
  report: Record<string, unknown>;
  chiefComplaint: string | null;
  differentialDiagnosis: string | null;
  followUpRecommendations: string | null;
  confidence: number | null;
  provider: string;
}> {
  const admin = createAstroAdminClient() as unknown as AdminClient;

  // Fetch transcription
  const { data: transcriptRow } = await admin
    .from('consultation_transcripts')
    .select('full_text, word_count')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const transcriptionText = (transcriptRow as { full_text: string; word_count: number } | null)?.full_text ?? '';

  // Fetch patient profile
  const patientProfile = await resolvePatientProfile(admin, patientId);
  const patientAge = patientProfile.dateOfBirth ? calculateAge(patientProfile.dateOfBirth) : null;

  // Fetch anamnesis data
  const anamnesisData = await getAnamnesisData(admin, patientId);

  // Build report request
  const reportRequest: GenerateReportRequest = {
    transcriptionText,
    anamnesisSummary: anamnesisData?.summaryText ?? null,
    anamnesisExtraction: anamnesisData?.extraction ?? null,
    doctorNotes: doctorNotes ?? null,
    patientName: patientProfile.name,
    patientAge,
    patientGender: patientProfile.gender,
  };

  const result = await generateConsultationReport(reportRequest);

  // Save to medical_records
  const { data: savedRecord, error: insertError } = await admin
    .from('medical_records')
    .insert({
      patient_id: patientId,
      doctor_id: doctorId,
      appointment_id: appointmentId,
      type: 'consultation',
      title: `Consulta ${new Date().toLocaleDateString('es-AR')} — ${result.chiefComplaint || 'Videollamada'}`,
      content: {
        ...result.report,
        chiefComplaint: result.chiefComplaint,
        differentialDiagnosis: result.differentialDiagnosis,
        followUpRecommendations: result.followUpRecommendations,
        aiGenerated: true,
        aiProvider: result.provider,
        aiModel: result.model,
        transcriptionWordCount: transcriptionText.split(/\s+/).filter(Boolean).length,
        anamnesisAvailable: !!anamnesisData?.summaryText,
        doctorNotes: doctorNotes ?? null,
        roomId,
      },
      visibility: 'care_team',
      date_recorded: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insertError) throw insertError;

  logger.info('[consultation-report] Generated and saved', {
    roomId,
    recordId: (savedRecord as { id: string }).id,
    provider: result.provider,
  });

  return {
    recordId: (savedRecord as { id: string }).id,
    report: result.report,
    chiefComplaint: result.chiefComplaint,
    differentialDiagnosis: result.differentialDiagnosis,
    followUpRecommendations: result.followUpRecommendations,
    confidence: result.confidence,
    provider: result.provider,
  };
}

/**
 * Update an existing medical record's report content.
 * Verifies ownership before merging new report data.
 */
export async function updateReportContent(
  recordId: string,
  doctorId: string,
  report: Record<string, unknown>,
  doctorNotes: string | undefined,
): Promise<void> {
  const admin = createAstroAdminClient() as unknown as AdminClient;

  const { data: existing } = await admin
    .from('medical_records')
    .select('id, doctor_id, content')
    .eq('id', recordId)
    .maybeSingle();

  const record = existing as ExistingRecord | null;
  if (record?.doctor_id !== doctorId) {
    throw new Error('Unauthorized: doctor does not own this record');
  }

  const updatedContent = {
    ...record.content,
    ...report,
    doctorReviewed: true,
    doctorNotes: doctorNotes ?? record.content.doctorNotes ?? null,
    reviewedAt: new Date().toISOString(),
  };

  const { error: updateError } = await admin
    .from('medical_records')
    .update({ content: updatedContent as Json })
    .eq('id', recordId);

  if (updateError) throw updateError;

  logger.info('[consultation-report] Updated report', { recordId, doctorId });
}
