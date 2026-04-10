import type { APIRoute } from 'astro';
import { createAstroAdminClient } from '@/lib/supabase';
import { logger } from '@autamedica/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveDoctorId, resolveRoomParticipants } from '@/lib/doctors/lib/resolve-room';
import { jsonOk, badRequest, forbidden, notFound, internalError } from '@/lib/api-helpers';
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth';


type AdminClient = SupabaseClient;

interface TranscriptSegmentInput {
  speaker: 'local' | 'remote';
  text: string;
  timestamp: number;
  isFinal: boolean;
}

interface TranscriptionBody {
  segments: TranscriptSegmentInput[];
  fullText: string;
  durationSeconds?: number;
  consentDoctor: boolean;
  consentPatient?: boolean;
  lang?: string;
}

export const POST: APIRoute = async ({ request, params }) => {
  const roomId = params.roomId;
  if (!roomId) {
    return badRequest('missing_room_id');
  }

  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES);
    if (!isAuthed(auth)) return auth;
    const { user } = auth;

    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as AdminClient;

    const doctorId = await resolveDoctorId(admin, user.id);
    if (!doctorId) {
      return forbidden('doctor_not_found');
    }

    const participants = await resolveRoomParticipants(admin, roomId);
    if (!participants) {
      return notFound('room_not_found');
    }

    const body = (await request.json()) as TranscriptionBody;

    if (!body.segments || !Array.isArray(body.segments)) {
      return badRequest('invalid_segments');
    }

    const finalSegments = body.segments.filter(s => s.isFinal && s.text.trim());
    const fullText = body.fullText || finalSegments.map(s => s.text).join(' ');
    const wordCount = fullText.split(/\s+/).filter(Boolean).length;

    const { error: insertError } = await admin
      .from('consultation_transcripts')
      .insert({
        room_id: roomId,
        doctor_id: doctorId,
        patient_id: participants.patientId,
        appointment_id: participants.appointmentId,
        segments: finalSegments as unknown as Record<string, unknown>[],
        full_text: fullText,
        duration_seconds: body.durationSeconds ?? null,
        word_count: wordCount,
        consent_doctor: body.consentDoctor,
        consent_patient: body.consentPatient ?? false,
        lang: body.lang ?? 'es-AR',
      });

    if (insertError) throw insertError;

    logger.info('[transcription] Saved', { roomId, segmentCount: finalSegments.length, wordCount });

    return jsonOk({ wordCount, segmentCount: finalSegments.length });
  } catch (error) {
    logger.error('[transcription] POST error', error);
    return internalError();
  }
};
