import type { APIRoute } from 'astro';
import { createAstroAdminClient } from '@/lib/supabase';
import { logger } from '@autamedica/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveDoctorId, resolveRoomParticipants, isDoctorAssignedToRoom, isClinicalPatientId } from '@/lib/doctors/lib/resolve-room';
import {
  consultationTranscriptsRepo,
  type TranscriptSegment,
} from '@/lib/doctors/lib/repos/consultation-transcripts.repo';
import { jsonOk, badRequest, forbidden, internalError } from '@/lib/api-helpers';
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth';


type AdminClient = SupabaseClient;

interface TranscriptionBody {
  segments: TranscriptSegment[];
  fullText: string;
  durationSeconds?: number;
  consentDoctor: boolean;
  consentPatient?: boolean;
  lang?: string;
}

export const POST: APIRoute = async ({ request, params, locals }) => {
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
    if (!isDoctorAssignedToRoom(participants, doctorId, user.id)) {
      return forbidden('room_not_assigned_to_doctor');
    }
    if (!isClinicalPatientId(participants.patientId)) {
      return forbidden('pharmacy_patient_identity_not_linked');
    }

    const body = (await request.json()) as TranscriptionBody;

    if (!body.segments || !Array.isArray(body.segments)) {
      return badRequest('invalid_segments');
    }

    const finalSegments = body.segments.filter(s => s.isFinal && s.text.trim());
    const fullText = body.fullText || finalSegments.map(s => s.text).join(' ');
    const wordCount = fullText.split(/\s+/).filter(Boolean).length;

    await consultationTranscriptsRepo.insert(admin, {
      roomId,
      doctorId,
      patientId: participants.patientId,
      appointmentId: participants.appointmentId,
      segments: finalSegments,
      fullText,
      durationSeconds: body.durationSeconds ?? null,
      wordCount,
      consentDoctor: body.consentDoctor,
      consentPatient: body.consentPatient ?? false,
      lang: body.lang ?? 'es-AR',
    });

    logger.info('[transcription] Saved', { roomId, segmentCount: finalSegments.length, wordCount });

    return jsonOk({ wordCount, segmentCount: finalSegments.length });
  } catch (error) {
    logger.error('[transcription] POST error', error);
    return internalError();
  }
};
