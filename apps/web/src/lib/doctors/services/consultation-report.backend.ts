/**
 * Backend Service: Consultation Report Generation and Update
 * Orchestrates repositories and AI services for report workflows.
 * Layer 6 of 7-layer architecture.
 */
import { createAstroAdminClient } from '@/lib/supabase';
import { buildAnamnesisSummary, logger } from '@autamedica/shared';
import { generateConsultationReport } from '@/lib/doctors/services/consultation-report-service';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GenerateReportRequest } from '@autamedica/types';
import { resolvePatientProfile } from '@/lib/doctors/lib/resolve-room';
import { consultationReportRepo } from '../lib/repos/consultation-report';
import { appointmentBackendService } from './appointment.backend';

type AdminClient = SupabaseClient;

function calculateAge(dateOfBirth: string): number {
  const birth = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

async function getAnamnesisData(
  admin: AdminClient,
  patientId: string,
): Promise<{ summaryText: string | null; extraction: Record<string, unknown> | null } | null> {
  const anamnesis = await consultationReportRepo.getAnamnesis(admin, patientId);
  if (!anamnesis?.privacy_accepted) return null;

  const sections = await consultationReportRepo.getAnamnesisSections(admin, anamnesis.id);
  let summaryText: string | null = null;

  if (sections.length > 0) {
    const summary = buildAnamnesisSummary(sections);
    summaryText = [summary.headline, ...summary.narrative].join('\n');
  }

  const extraction = await consultationReportRepo.getLatestExtraction(admin, anamnesis.id);

  return { summaryText, extraction };
}

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

  const [transcriptionText, patientProfile, anamnesisData] = await Promise.all([
    consultationReportRepo.getTranscriptionText(admin, roomId),
    resolvePatientProfile(admin, patientId),
    getAnamnesisData(admin, patientId),
  ]);

  const patientAge = patientProfile.dateOfBirth ? calculateAge(patientProfile.dateOfBirth) : null;

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

  const saved = await consultationReportRepo.insertMedicalRecord(admin, {
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
  });

  if (appointmentId) {
    try {
      await appointmentBackendService.transitionStatus(appointmentId, 'completed');
    } catch (err) {
      logger.warn('[consultation-report] Appointment transition to completed failed', {
        appointmentId,
        error: err,
      });
    }
  }

  logger.info('[consultation-report] Generated and saved', {
    roomId,
    recordId: saved.id,
    provider: result.provider,
  });

  return {
    recordId: saved.id,
    report: result.report as unknown as Record<string, unknown>,
    chiefComplaint: result.chiefComplaint,
    differentialDiagnosis: result.differentialDiagnosis.join(', ') || null,
    followUpRecommendations: result.followUpRecommendations.join(', ') || null,
    confidence: result.confidence,
    provider: result.provider,
  };
}

export async function updateReportContent(
  recordId: string,
  doctorId: string,
  report: Record<string, unknown>,
  doctorNotes: string | undefined,
): Promise<void> {
  const admin = createAstroAdminClient() as unknown as AdminClient;

  const record = await consultationReportRepo.findMedicalRecord(admin, recordId);
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

  await consultationReportRepo.updateMedicalRecordContent(admin, recordId, updatedContent);

  logger.info('[consultation-report] Updated report', { recordId, doctorId });
}
