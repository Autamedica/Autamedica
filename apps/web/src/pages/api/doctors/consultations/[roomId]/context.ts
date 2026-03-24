import type { APIRoute } from 'astro';
import { createServerClientFromRequest, createAdminClient } from '@autamedica/auth/server';
import { buildAnamnesisSummary, logger } from '@autamedica/shared';
import {
  buildAnamnesisExtractionRequest,
  executeAnamnesisExtraction,
  isAnamnesisExtractionConfigured,
  ANAMNESIS_EXTRACTION_PROMPT_VERSION,
} from '@/lib/patients/server/anamnesis-ai-extraction';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@autamedica/types';
import { createHash } from 'node:crypto';
import { jsonOk, badRequest, unauthorized, forbidden, internalError } from '@/lib/api-helpers';

type AdminClient = SupabaseClient;

interface CallRecord {
  patient_id: string;
  doctor_id: string;
}

interface TelemedicineSessionRecord {
  patient_id: string;
  doctor_id: string;
  appointment_id: string | null;
}

interface AnamnesisRecord {
  id: string;
  status: string;
  privacy_accepted: boolean | null;
  completion_percentage: number | null;
}

interface PatientRecord {
  id: string;
  user_id: string | null;
}

interface ProfileRecord {
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
}

interface SectionRecord {
  section: string;
  data: Json;
  completed: boolean | null;
  updated_at: string | null;
}

interface ExtractionCacheRecord {
  extraction_result: unknown;
  provider_name: string;
  model_name: string;
  prompt_version: string;
}

/** Resolve roomId to patient_id and doctor_id */
async function resolveRoomParticipants(
  admin: AdminClient,
  roomId: string,
): Promise<{ patientId: string; doctorId: string; appointmentId: string | null } | null> {
  // Try calls table first (primary path for P2P calls)
  const { data: callRow, error: callError } = await admin
    .from('calls')
    .select('patient_id, doctor_id')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!callError && callRow) {
    const call = callRow as CallRecord;
    return { patientId: call.patient_id, doctorId: call.doctor_id, appointmentId: null };
  }

  // Fallback to telemedicine_sessions
  const { data: sessionRow, error: sessionError } = await admin
    .from('telemedicine_sessions')
    .select('patient_id, doctor_id, appointment_id')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionError || !sessionRow) return null;

  const session = sessionRow as TelemedicineSessionRecord;
  return {
    patientId: session.patient_id,
    doctorId: session.doctor_id,
    appointmentId: session.appointment_id,
  };
}

/** Resolve patient profile (name, age, gender) */
async function resolvePatientProfile(
  admin: AdminClient,
  patientId: string,
): Promise<{ name: string; dateOfBirth: string | null; gender: string | null }> {
  const { data: patientRow } = await admin
    .from('patients')
    .select('user_id')
    .eq('id', patientId)
    .maybeSingle();

  const userId = (patientRow as PatientRecord | null)?.user_id;
  if (!userId) {
    return { name: `Paciente`, dateOfBirth: null, gender: null };
  }

  const { data: profileRow } = await admin
    .from('profiles')
    .select('first_name, last_name, date_of_birth, gender')
    .eq('user_id', userId)
    .maybeSingle();

  const profile = profileRow as ProfileRecord | null;
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();

  return {
    name: fullName || 'Paciente',
    dateOfBirth: profile?.date_of_birth ?? null,
    gender: profile?.gender ?? null,
  };
}

/** Compute SHA256 hash of anamnesis sections data for cache key */
function computeSectionsHash(sections: SectionRecord[]): string {
  const content = sections
    .map(s => `${s.section}:${JSON.stringify(s.data)}`)
    .sort()
    .join('|');
  return createHash('sha256').update(content).digest('hex');
}

/** Try to get cached extraction, or execute new one */
async function getOrCreateExtraction(
  admin: AdminClient,
  anamnesisId: string,
  patientId: string,
  patientLabel: string,
  anamnesisStatus: string,
  sections: SectionRecord[],
): Promise<{ extraction: unknown; fromCache: boolean } | null> {
  if (!isAnamnesisExtractionConfigured()) {
    return null;
  }

  const sectionsHash = computeSectionsHash(sections);

  // Check cache
  const { data: cached } = await admin
    .from('anamnesis_extractions')
    .select('extraction_result, provider_name, model_name, prompt_version')
    .eq('anamnesis_id', anamnesisId)
    .eq('source_sections_hash', sectionsHash)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached) {
    const cacheRecord = cached as ExtractionCacheRecord;
    return { extraction: cacheRecord.extraction_result, fromCache: true };
  }

  // Execute new extraction
  try {
    const request = buildAnamnesisExtractionRequest({
      patientId,
      patientLabel,
      anamnesisStatus,
      privacyAccepted: true,
      sections,
    });

    const { result, providerName, modelName } = await executeAnamnesisExtraction(request);

    // Cache the result
    await admin.from('anamnesis_extractions').upsert(
      {
        anamnesis_id: anamnesisId,
        patient_id: patientId,
        provider_name: providerName,
        model_name: modelName,
        prompt_version: ANAMNESIS_EXTRACTION_PROMPT_VERSION,
        extraction_result: result as unknown as Record<string, unknown>,
        source_sections_hash: sectionsHash,
      },
      { onConflict: 'anamnesis_id,source_sections_hash' },
    );

    return { extraction: result, fromCache: false };
  } catch (err) {
    logger.error('[consultation-context] AI extraction failed, returning without extraction', err);
    return null;
  }
}

/** Resolve doctorId from userId */
async function resolveDoctorId(admin: AdminClient, userId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('doctors')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data as { id: string } | null)?.id ?? null;
}

export const GET: APIRoute = async ({ request, params }) => {
  const roomId = params.roomId;
  if (!roomId) {
    return badRequest('missing_room_id');
  }

  try {
    // Auth
    const supabase = createServerClientFromRequest(request);
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return unauthorized();
    }

    const admin = createAdminClient() as unknown as AdminClient;

    // Verify caller is a doctor
    const doctorId = await resolveDoctorId(admin, session.user.id);
    if (!doctorId) {
      return forbidden('doctor_not_found');
    }

    // Resolve room → patient
    const participants = await resolveRoomParticipants(admin, roomId);
    if (!participants) {
      // No call/session found for this room - return empty context (non-blocking)
      return jsonOk({
        hasAnamnesis: false,
        patient: null,
        summary: null,
        extraction: null,
        redFlags: [],
        suggestedQuestions: [],
      });
    }

    const { patientId } = participants;

    // Get patient profile
    const patientProfile = await resolvePatientProfile(admin, patientId);

    // Get anamnesis
    const { data: anamnesisRow, error: anamnesisError } = await admin
      .from('anamnesis')
      .select('id, status, privacy_accepted, completion_percentage')
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .maybeSingle();

    if (anamnesisError) throw anamnesisError;

    const anamnesis = anamnesisRow as AnamnesisRecord | null;

    if (!anamnesis?.privacy_accepted) {
      return jsonOk({
        hasAnamnesis: false,
        patient: patientProfile,
        summary: null,
        extraction: null,
        redFlags: [],
        suggestedQuestions: [],
        reason: !anamnesis ? 'not_started' : 'not_shared',
      });
    }

    // Get sections
    const { data: sectionsRaw, error: sectionsError } = await admin
      .from('anamnesis_sections')
      .select('section, data, completed, updated_at')
      .eq('anamnesis_id', anamnesis.id)
      .order('updated_at', { ascending: true });

    if (sectionsError) throw sectionsError;

    const sections = (sectionsRaw ?? []) as SectionRecord[];
    const summary = buildAnamnesisSummary(sections);

    // Get or create AI extraction
    const extractionResult = await getOrCreateExtraction(
      admin,
      anamnesis.id,
      patientId,
      patientProfile.name,
      anamnesis.status,
      sections,
    );

    // Extract red flags and suggested questions from extraction
    const extraction = extractionResult?.extraction as Record<string, unknown> | null;
    const redFlags = (extraction?.safetyFlags as string[]) ?? [];
    const clinicianQuestions = (extraction?.clinicianQuestions as string[]) ?? [];
    const nextQuestions = (extraction?.nextQuestions as Array<{ question: string; priority: string }>) ?? [];

    // Merge and sort questions by priority
    const suggestedQuestions = [
      ...clinicianQuestions.map(q => ({ question: q, priority: 'high' as const })),
      ...nextQuestions.map(q => ({ question: q.question, priority: q.priority as 'critical' | 'high' | 'medium' })),
    ].sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2 };
      return (order[a.priority as keyof typeof order] ?? 3) - (order[b.priority as keyof typeof order] ?? 3);
    });

    return jsonOk({
      hasAnamnesis: true,
      patient: patientProfile,
      anamnesisStatus: anamnesis.status,
      completionPercentage: anamnesis.completion_percentage,
      summary,
      extraction,
      extractionFromCache: extractionResult?.fromCache ?? false,
      redFlags,
      suggestedQuestions,
    });
  } catch (error) {
    logger.error('[consultation-context] GET error', error);
    return internalError();
  }
};
