/**
 * Backend Service: Consultation Report Generation and Update
 * Orchestrates repositories and AI services for report workflows.
 * Layer 6 of 7-layer architecture.
 */
import { createAstroAdminClient } from '@/lib/supabase';
import { buildAnamnesisSummary, domainEvents, logger } from '@autamedica/shared';
import { generateConsultationReport } from '@/lib/doctors/services/consultation-report-service';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GenerateReportRequest } from '@autamedica/types';
import { orchestrateRacRegistration } from '@/lib/datasus/rac-orchestrator';
import { resolvePatientProfile } from '@/lib/doctors/lib/resolve-room';
import { consultationReportRepo } from '../lib/repos/consultation-report';
import { appointmentBackendService } from './appointment.backend';

type AdminClient = SupabaseClient;

export interface ActiveClinicalIncidentForReport {
  id: string;
  conditionDisplay: string;
  setting: string;
  severity: string;
  status: string;
  slaDeadline: string;
}

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
  runtimeEnv?: Record<string, unknown> | null,
): Promise<{
  recordId: string;
  patientId: string;
  report: Record<string, unknown>;
  chiefComplaint: string | null;
  differentialDiagnosis: string[];
  followUpRecommendations: string[];
  confidence: number | null;
  provider: string;
  activeClinicalIncidents: ActiveClinicalIncidentForReport[];
}> {
  const admin = createAstroAdminClient(runtimeEnv) as unknown as AdminClient;

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
      await appointmentBackendService.transitionStatus(appointmentId, 'completed', runtimeEnv);
    } catch (err) {
      logger.warn('[consultation-report] Appointment transition to completed failed', {
        appointmentId,
        error: err,
      });
    }
  }

  try {
    await domainEvents.emit('consultation.report_generated', {
      consultationId: saved.id,
      doctorId,
      patientId,
      reportUrl: '/patients/reports',
    });
  } catch (err) {
    logger.warn('[consultation-report] Failed to publish consultation.report_generated', {
      recordId: saved.id,
      error: err,
    });
  }

  // RNDS (DATASUS) RAC registration: non-blocking, disabled by default.
  void (async () => {
    try {
      const [patient, doctor] = await Promise.all([
        admin.from('patients')
          .select('cns, cpf')
          .eq('id', patientId)
          .maybeSingle(),
        admin.from('doctors')
          .select('cpf, license_number, license_type, uf_brazil, enrollment_jurisdiction')
          .eq('id', doctorId)
          .maybeSingle(),
      ]);

      const patientRow = patient as { cns?: string | null; cpf?: string | null } | null;
      const doctorRow = doctor as {
        cpf?: string | null;
        license_number?: string | null;
        license_type?: string | null;
        uf_brazil?: string | null;
        enrollment_jurisdiction?: string | null;
      } | null;

      const isBrazil = doctorRow?.license_type === 'CRM' || !!doctorRow?.uf_brazil;
      if (!isBrazil) return;

      const allergies = (result.report as { alergias?: Array<{ categoria?: string; criticidade?: string; agente?: string; manifestacao?: string }> }).alergias ?? [];
      const medications = (result.report as { medicamentos?: Array<{ texto?: string; quantidade?: number; apresentacao?: string }> }).medicamentos ?? [];

      await orchestrateRacRegistration({
        consultationId: saved.id,
        cns: patientRow?.cns,
        cpf: patientRow?.cpf,
        dataHoraAtendimento: new Date().toISOString(),
        motivos: result.chiefComplaint ? [result.chiefComplaint] : [],
        problemas: (result.differentialDiagnosis ?? []).map((descricao) => ({ codigo: '', descricao })),
        alergias: allergies.map((alergia) => ({
          categoria: alergia.categoria ?? 'medicacao',
          criticidade: alergia.criticidade ?? 'baixa',
          agente: alergia.agente ?? '',
          manifestacao: alergia.manifestacao,
        })),
        medicamentos: medications.map((med) => ({
          texto: med.texto ?? '',
          quantidade: med.quantidade,
          apresentacao: med.apresentacao,
        })),
        profissional: {
          cpf: doctorRow?.cpf ?? '',
          conselhoTipo: (doctorRow?.license_type as 'CRM' | 'COREN' | 'CRF' | 'CRO' | 'CRMV' | 'CREFITO') ?? 'CRM',
          conselhoUf: doctorRow?.uf_brazil ?? doctorRow?.enrollment_jurisdiction ?? 'RS',
          conselhoNumero: doctorRow?.license_number ?? '',
        },
        runtimeEnv,
      }, admin);
    } catch (err) {
      logger.warn('[consultation-report] RNDS RAC registration skipped (non-blocking)', {
        recordId: saved.id,
        error: err,
      });
    }
  })();

  logger.info('[consultation-report] Generated and saved', {
    roomId,
    recordId: saved.id,
    provider: result.provider,
  });

  const { data: activeClinicalIncidents, error: incidentsError } = await admin
    .from('clinical_incidents')
    .select('id, condition_display, setting, severity, status, sla_deadline')
    .eq('patient_id', patientId)
    .eq('doctor_id', doctorId)
    .in('status', ['open', 'escalated'])
    .order('sla_deadline', { ascending: true })
    .limit(5);

  if (incidentsError) {
    logger.warn('[consultation-report] Failed to load active clinical incidents', {
      roomId,
      patientId,
      doctorId,
      error: incidentsError,
    });
  }

  return {
    recordId: saved.id,
    patientId,
    report: result.report as unknown as Record<string, unknown>,
    chiefComplaint: result.chiefComplaint,
    differentialDiagnosis: result.differentialDiagnosis,
    followUpRecommendations: result.followUpRecommendations,
    confidence: result.confidence,
    provider: result.provider,
    activeClinicalIncidents: (activeClinicalIncidents ?? []).map((incident) => ({
      id: incident.id,
      conditionDisplay: incident.condition_display,
      setting: incident.setting,
      severity: incident.severity,
      status: incident.status,
      slaDeadline: incident.sla_deadline,
    })),
  };
}

export async function updateReportContent(
  recordId: string,
  doctorId: string,
  report: Record<string, unknown>,
  doctorNotes: string | undefined,
  runtimeEnv?: Record<string, unknown> | null,
): Promise<void> {
  const admin = createAstroAdminClient(runtimeEnv) as unknown as AdminClient;

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
