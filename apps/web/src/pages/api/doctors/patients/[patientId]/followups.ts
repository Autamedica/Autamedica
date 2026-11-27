import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DOCTOR_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { badRequest, forbidden, internalError, jsonOk } from '@/lib/api-helpers';
import {
  isValidUuid,
  resolveActiveDoctorId,
  verifyDoctorPatientAccess,
} from '@/lib/doctors/services/patient-clinical-workspace';
import { createAstroAdminClient } from '@/lib/supabase';
import { logger } from '@autamedica/shared';

const ALLOWED_CHANNELS = new Set(['whatsapp', 'email', 'sms', 'push']);

export const GET: APIRoute = async ({ params, request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  const patientId = params.patientId?.trim() ?? '';
  if (!isValidUuid(patientId)) return badRequest('invalid_patient_id');

  const admin = createAstroAdminClient(locals?.runtime?.env) as unknown as SupabaseClient;
  const doctor = await resolveActiveDoctorId(admin, auth.user.id);
  if (!doctor) return forbidden('doctor_profile_required');

  if (!(await verifyDoctorPatientAccess(admin, doctor.id, patientId))) {
    return forbidden('forbidden_patient_access');
  }

  const { data, error } = await admin
    .from('appointment_followups')
    .select('id, patient_id, doctor_id, channel, event_type, message, scheduled_for, status, sent_at, metadata, created_at')
    .eq('doctor_id', doctor.id)
    .eq('patient_id', patientId)
    .order('scheduled_for', { ascending: false })
    .limit(20);

  if (error) {
    logger.error('[api/doctors/patients/followups] GET failed', error);
    return internalError('followups_fetch_failed');
  }

  return jsonOk({ followups: data ?? [] });
};

export const POST: APIRoute = async ({ params, request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  const patientId = params.patientId?.trim() ?? '';
  if (!isValidUuid(patientId)) return badRequest('invalid_patient_id');

  let body: {
    scheduledFor?: unknown;
    objective?: unknown;
    channel?: unknown;
    recipientPhone?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return badRequest('invalid_json');
  }

  const scheduledForRaw = typeof body.scheduledFor === 'string' ? body.scheduledFor.trim() : '';
  const scheduledMs = Date.parse(scheduledForRaw);
  if (!scheduledForRaw || !Number.isFinite(scheduledMs)) {
    return badRequest('invalid_scheduled_for');
  }

  const objective = typeof body.objective === 'string' ? body.objective.trim() : '';
  if (objective.length < 3 || objective.length > 500) {
    return badRequest('followup_objective_required');
  }

  const rawChannel = typeof body.channel === 'string' ? body.channel.trim().toLowerCase() : 'whatsapp';
  const channel = ALLOWED_CHANNELS.has(rawChannel) ? rawChannel : 'whatsapp';

  const admin = createAstroAdminClient(locals?.runtime?.env) as unknown as SupabaseClient;
  const doctor = await resolveActiveDoctorId(admin, auth.user.id);
  if (!doctor) return forbidden('doctor_profile_required');

  if (!(await verifyDoctorPatientAccess(admin, doctor.id, patientId))) {
    return forbidden('forbidden_patient_access');
  }

  // Resolve patient contact & name safely
  let patientName: string | null = null;
  let recipientPhone =
    typeof body.recipientPhone === 'string' && body.recipientPhone.trim()
      ? body.recipientPhone.trim()
      : '';

  const { data: patientRow } = await admin
    .from('patients')
    .select('user_id, official_full_name')
    .eq('id', patientId)
    .maybeSingle();

  if (patientRow?.official_full_name) {
    patientName = String(patientRow.official_full_name);
  }
  if (patientRow?.user_id) {
    const { data: prof } = await admin
      .from('profiles')
      .select('first_name, last_name, phone')
      .eq('user_id', patientRow.user_id)
      .maybeSingle();
    if (prof) {
      const full = [prof.first_name, prof.last_name].filter(Boolean).join(' ').trim();
      if (full) patientName = full;
      if (!recipientPhone && prof.phone) recipientPhone = String(prof.phone).trim();
    }
  }

  if (!recipientPhone) {
    const { data: priv } = await admin
      .from('patient_private_identities')
      .select('full_name, phone, email')
      .eq('doctor_id', doctor.id)
      .eq('patient_id', patientId)
      .maybeSingle();
    if (priv) {
      if (!patientName && priv.full_name) patientName = String(priv.full_name);
      recipientPhone = String(priv.phone || priv.email || '').trim();
    }
  }

  if (!recipientPhone) {
    recipientPhone = 'pending-contact';
  }

  const dedupeKey = `clinical_followup:${doctor.id}:${patientId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

  const { data, error } = await admin
    .from('appointment_followups')
    .insert({
      patient_id: patientId,
      doctor_id: doctor.id,
      recipient_phone: recipientPhone,
      patient_name: patientName,
      channel,
      event_type: 'clinical.doctor_followup',
      message: objective,
      scheduled_for: new Date(scheduledMs).toISOString(),
      status: 'pending',
      dedupe_key: dedupeKey,
      metadata: { source: 'clinical_workspace', created_by_user_id: auth.user.id },
    })
    .select('id, patient_id, doctor_id, channel, event_type, message, scheduled_for, status, sent_at, metadata, created_at')
    .single();

  if (error) {
    logger.error('[api/doctors/patients/followups] POST failed', error);
    return internalError('followup_create_failed');
  }

  return jsonOk({ followup: data }, 201);
};

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  const patientId = params.patientId?.trim() ?? '';
  if (!isValidUuid(patientId)) return badRequest('invalid_patient_id');

  let body: { followupId?: unknown; action?: unknown; notes?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return badRequest('invalid_json');
  }

  const followupId = typeof body.followupId === 'string' ? body.followupId.trim() : '';
  const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';
  if (!isValidUuid(followupId)) return badRequest('invalid_followup_id');
  if (action !== 'complete' && action !== 'cancel') return badRequest('invalid_followup_action');

  const admin = createAstroAdminClient(locals?.runtime?.env) as unknown as SupabaseClient;
  const doctor = await resolveActiveDoctorId(admin, auth.user.id);
  if (!doctor) return forbidden('doctor_profile_required');

  if (!(await verifyDoctorPatientAccess(admin, doctor.id, patientId))) {
    return forbidden('forbidden_patient_access');
  }

  const { data: existing } = await admin
    .from('appointment_followups')
    .select('id, metadata')
    .eq('id', followupId)
    .eq('doctor_id', doctor.id)
    .eq('patient_id', patientId)
    .maybeSingle();

  if (!existing) return forbidden('followup_not_found');

  const existingMeta =
    existing.metadata && typeof existing.metadata === 'object'
      ? (existing.metadata as Record<string, unknown>)
      : {};
  const nowIso = new Date().toISOString();
  const nextStatus = action === 'complete' ? 'sent' : 'cancelled';

  const { data, error } = await admin
    .from('appointment_followups')
    .update({
      status: nextStatus,
      sent_at: action === 'complete' ? nowIso : null,
      updated_at: nowIso,
      metadata: {
        ...existingMeta,
        ...(action === 'complete' ? { completed_at: nowIso } : { cancelled_at: nowIso }),
        ...(typeof body.notes === 'string' && body.notes.trim()
          ? { resolution_notes: body.notes.trim().slice(0, 500) }
          : {}),
      },
    })
    .eq('id', followupId)
    .eq('doctor_id', doctor.id)
    .select('id, patient_id, doctor_id, channel, event_type, message, scheduled_for, status, sent_at, metadata, created_at')
    .single();

  if (error) {
    logger.error('[api/doctors/patients/followups] PATCH failed', error);
    return internalError('followup_update_failed');
  }

  return jsonOk({ followup: data });
};
