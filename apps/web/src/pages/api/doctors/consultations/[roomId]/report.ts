import type { APIRoute } from 'astro';
import { createServerClientFromRequest, createAdminClient } from '@autamedica/auth/server';
import { buildAnamnesisSummary, logger } from '@autamedica/shared';
import { generateConsultationReport } from '@/lib/doctors/services/consultation-report-service';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@autamedica/types';
import type { GenerateReportRequest } from '@autamedica/types';

type AdminClient = SupabaseClient;

async function resolveDoctorId(admin: AdminClient, userId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('doctors')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string } | null)?.id ?? null;
}

async function resolveRoomParticipants(
  admin: AdminClient,
  roomId: string,
): Promise<{ patientId: string; appointmentId: string | null } | null> {
  const { data: callRow } = await admin
    .from('calls')
    .select('patient_id')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (callRow) {
    return { patientId: (callRow as { patient_id: string }).patient_id, appointmentId: null };
  }

  const { data: sessionRow } = await admin
    .from('telemedicine_sessions')
    .select('patient_id, appointment_id')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sessionRow) return null;
  const session = sessionRow as { patient_id: string; appointment_id: string | null };
  return { patientId: session.patient_id, appointmentId: session.appointment_id };
}

async function resolvePatientProfile(
  admin: AdminClient,
  patientId: string,
): Promise<{ name: string; dateOfBirth: string | null; gender: string | null }> {
  const { data: patientRow } = await admin
    .from('patients')
    .select('user_id')
    .eq('id', patientId)
    .maybeSingle();

  const userId = (patientRow as { user_id: string | null } | null)?.user_id;
  if (!userId) return { name: 'Paciente', dateOfBirth: null, gender: null };

  const { data: profileRow } = await admin
    .from('profiles')
    .select('first_name, last_name, date_of_birth, gender')
    .eq('user_id', userId)
    .maybeSingle();

  const profile = profileRow as { first_name: string | null; last_name: string | null; date_of_birth: string | null; gender: string | null } | null;
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();

  return {
    name: fullName || 'Paciente',
    dateOfBirth: profile?.date_of_birth ?? null,
    gender: profile?.gender ?? null,
  };
}

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

export const POST: APIRoute = async ({ request, params }) => {
  const roomId = params.roomId;
  if (!roomId) {
    return new Response(JSON.stringify({ ok: false, error: 'missing_room_id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createServerClientFromRequest(request);
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const admin = createAdminClient() as unknown as AdminClient;
    const doctorId = await resolveDoctorId(admin, session.user.id);
    if (!doctorId) {
      return new Response(JSON.stringify({ ok: false, error: 'doctor_not_found' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const participants = await resolveRoomParticipants(admin, roomId);
    if (!participants) {
      return new Response(JSON.stringify({ ok: false, error: 'room_not_found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
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

    return new Response(JSON.stringify({
      ok: true,
      data: {
        recordId: (savedRecord as { id: string }).id,
        report: result.report,
        chiefComplaint: result.chiefComplaint,
        differentialDiagnosis: result.differentialDiagnosis,
        followUpRecommendations: result.followUpRecommendations,
        confidence: result.confidence,
        provider: result.provider,
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('[consultation-report] POST error', error);
    return new Response(JSON.stringify({ ok: false, error: 'internal_error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
