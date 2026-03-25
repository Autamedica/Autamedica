import type { APIRoute } from 'astro';
import { createAstroAdminClient } from '@/lib/supabase';
import { buildAnamnesisSummary, logger } from '@autamedica/shared';
import { generateConsultationReport } from '@/lib/doctors/services/consultation-report-service';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@autamedica/types';
import type { GenerateReportRequest } from '@autamedica/types';
import { resolveDoctorId, resolveRoomParticipants, resolvePatientProfile } from '@/lib/doctors/lib/resolve-room';
import { jsonOk, badRequest, forbidden, notFound, internalError } from '@/lib/api-helpers';
import { withAuth, isAuthed } from '@/lib/api-auth';

type AdminClient = SupabaseClient;

function calculateAge(dateOfBirth: string): number {
  const birth = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

interface SectionRecord {
  section: string;
  data: Json;
  completed: boolean | null;
  updated_at: string | null;
}

export const PATCH: APIRoute = async ({ request, params }) => {
  const roomId = params.roomId;
  if (!roomId) {
    return badRequest('missing_room_id');
  }

  try {
    const auth = await withAuth(request);
    if (!isAuthed(auth)) return auth;
    const { user } = auth;

    const admin = createAstroAdminClient() as unknown as AdminClient;
    const doctorId = await resolveDoctorId(admin, user.id);
    if (!doctorId) {
      return forbidden('doctor_not_found');
    }

    const body = (await request.json()) as {
      recordId: string;
      report: Record<string, unknown>;
      doctorNotes?: string;
    };

    if (!body.recordId) {
      return badRequest('missing_record_id');
    }

    // Verify the record belongs to this doctor
    const { data: existing } = await admin
      .from('medical_records')
      .select('id, doctor_id, content')
      .eq('id', body.recordId)
      .maybeSingle();

    const record = existing as { id: string; doctor_id: string; content: Record<string, unknown> } | null;
    if (record?.doctor_id !== doctorId) {
      return forbidden();
    }

    // Merge the edited report into existing content
    const updatedContent = {
      ...record.content,
      ...body.report,
      doctorReviewed: true,
      doctorNotes: body.doctorNotes ?? record.content.doctorNotes ?? null,
      reviewedAt: new Date().toISOString(),
    };

    const { error: updateError } = await admin
      .from('medical_records')
      .update({ content: updatedContent as Json })
      .eq('id', body.recordId);

    if (updateError) throw updateError;

    logger.info('[consultation-report] PATCH saved', { roomId, recordId: body.recordId });

    return jsonOk(null);
  } catch (error) {
    logger.error('[consultation-report] PATCH error', error);
    return internalError();
  }
};

export const POST: APIRoute = async ({ request, params }) => {
  const roomId = params.roomId;
  if (!roomId) {
    return badRequest('missing_room_id');
  }

  try {
    const auth = await withAuth(request);
    if (!isAuthed(auth)) return auth;
    const { user } = auth;

    const admin = createAstroAdminClient() as unknown as AdminClient;
    const doctorId = await resolveDoctorId(admin, user.id);
    if (!doctorId) {
      return forbidden('doctor_not_found');
    }

    const participants = await resolveRoomParticipants(admin, roomId);
    if (!participants) {
      return notFound('room_not_found');
    }

    const { patientId, appointmentId } = participants;

    // Parse request body
    const body = (await request.json()) as { doctorNotes?: string };

    // Get transcription
    const { data: transcriptRow } = await admin
      .from('consultation_transcripts')
      .select('full_text, word_count')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const transcriptionText = (transcriptRow as { full_text: string; word_count: number } | null)?.full_text ?? '';

    // Get patient profile
    const patientProfile = await resolvePatientProfile(admin, patientId);
    const patientAge = patientProfile.dateOfBirth ? calculateAge(patientProfile.dateOfBirth) : null;

    // Get anamnesis data
    let anamnesisSummaryText: string | null = null;
    let anamnesisExtraction: Record<string, unknown> | null = null;

    const { data: anamnesisRow } = await admin
      .from('anamnesis')
      .select('id, status, privacy_accepted')
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .maybeSingle();

    const anamnesis = anamnesisRow as { id: string; status: string; privacy_accepted: boolean | null } | null;

    if (anamnesis?.privacy_accepted) {
      // Get sections for summary
      const { data: sectionsRaw } = await admin
        .from('anamnesis_sections')
        .select('section, data, completed, updated_at')
        .eq('anamnesis_id', anamnesis.id)
        .order('updated_at', { ascending: true });

      const sections = (sectionsRaw ?? []) as SectionRecord[];
      if (sections.length > 0) {
        const summary = buildAnamnesisSummary(sections);
        anamnesisSummaryText = [summary.headline, ...summary.narrative].join('\n');
      }

      // Get cached extraction
      const { data: extractionRow } = await admin
        .from('anamnesis_extractions')
        .select('extraction_result')
        .eq('anamnesis_id', anamnesis.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (extractionRow) {
        anamnesisExtraction = (extractionRow as { extraction_result: unknown }).extraction_result as Record<string, unknown>;
      }
    }

    // Generate SOAP report via AI
    const reportRequest: GenerateReportRequest = {
      transcriptionText,
      anamnesisSummary: anamnesisSummaryText,
      anamnesisExtraction,
      doctorNotes: body.doctorNotes ?? null,
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
          anamnesisAvailable: !!anamnesisSummaryText,
          doctorNotes: body.doctorNotes ?? null,
          roomId,
        },
        visibility: 'care_team',
        date_recorded: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertError) throw insertError;

    logger.info('[consultation-report] Saved', {
      roomId,
      recordId: (savedRecord as { id: string }).id,
      provider: result.provider,
    });

    return jsonOk({
      recordId: (savedRecord as { id: string }).id,
      report: result.report,
      chiefComplaint: result.chiefComplaint,
      differentialDiagnosis: result.differentialDiagnosis,
      followUpRecommendations: result.followUpRecommendations,
      confidence: result.confidence,
      provider: result.provider,
    });
  } catch (error) {
    logger.error('[consultation-report] POST error', error);
    return internalError();
  }
};
