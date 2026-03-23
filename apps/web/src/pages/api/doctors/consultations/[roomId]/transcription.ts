import type { APIRoute } from 'astro';
import { createServerClientFromRequest, createAdminClient } from '@autamedica/auth/server';
import { logger } from '@autamedica/shared';
import type { SupabaseClient } from '@supabase/supabase-js';

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
  lang?: string;
}

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

    const body = (await request.json()) as TranscriptionBody;

    if (!body.segments || !Array.isArray(body.segments)) {
      return new Response(JSON.stringify({ ok: false, error: 'invalid_segments' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
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
        consent_patient: false,
        lang: body.lang ?? 'es-AR',
      });

    if (insertError) throw insertError;

    logger.info('[transcription] Saved', { roomId, segmentCount: finalSegments.length, wordCount });

    return new Response(JSON.stringify({ ok: true, data: { wordCount, segmentCount: finalSegments.length } }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('[transcription] POST error', error);
    return new Response(JSON.stringify({ ok: false, error: 'internal_error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
