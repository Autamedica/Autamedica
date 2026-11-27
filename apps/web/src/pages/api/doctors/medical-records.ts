/**
 * Backend Controller: Medical Records API.
 * Path: /api/doctors/medical-records
 *
 * GET  ?patientId=X -> records for patient (required)
 * POST              -> create evolution / SOAP / clinical note
 */
import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { medicalRecordsBackendService } from '@/lib/doctors/services/medical-records.backend';
import {
  isValidUuid,
  normalizeClinicalRecordType,
  resolveActiveDoctorId,
  verifyDoctorPatientAccess,
} from '@/lib/doctors/services/patient-clinical-workspace';
import { createAstroAdminClient } from '@/lib/supabase';
import { logger } from '@autamedica/shared';
import { jsonOk, badRequest, forbidden, internalError } from '@/lib/api-helpers';
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth';

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  try {
    const url = new URL(request.url);
    const patientId = url.searchParams.get('patientId')?.trim() ?? '';

    if (!isValidUuid(patientId)) {
      return badRequest('patientId is required');
    }

    const admin = createAstroAdminClient(locals?.runtime?.env);
    const untypedAdmin = admin as unknown as SupabaseClient;
    const doctor = await resolveActiveDoctorId(untypedAdmin, auth.user.id);
    if (!doctor) return forbidden('doctor_profile_required');

    const hasAccess = await verifyDoctorPatientAccess(untypedAdmin, doctor.id, patientId);
    if (!hasAccess) return forbidden('forbidden_patient_access');

    const result = await medicalRecordsBackendService.getByPatient(
      {
        patientId,
        type: url.searchParams.get('type') ?? undefined,
        dateFrom: url.searchParams.get('dateFrom') ?? undefined,
        dateTo: url.searchParams.get('dateTo') ?? undefined,
        diagnosisContains: url.searchParams.get('diagnosisContains') ?? undefined,
        page: parseInt(url.searchParams.get('page') ?? '0', 10),
        pageSize: parseInt(url.searchParams.get('pageSize') ?? '20', 10),
      },
      admin,
    );

    return jsonOk(result);
  } catch (err) {
    logger.error('[api/doctors/medical-records] GET error:', err);
    return internalError();
  }
};

interface CreateMedicalRecordBody {
  patientId?: unknown;
  type?: unknown;
  kind?: unknown;
  title?: unknown;
  summary?: unknown;
  diagnosis?: unknown;
  subjective?: unknown;
  objective?: unknown;
  assessment?: unknown;
  plan?: unknown;
  appointmentId?: unknown;
  visibility?: unknown;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  let body: CreateMedicalRecordBody;
  try {
    body = (await request.json()) as CreateMedicalRecordBody;
  } catch {
    return badRequest('invalid_json');
  }

  const patientId = typeof body.patientId === 'string' ? body.patientId.trim() : '';
  if (!isValidUuid(patientId)) return badRequest('invalid_patient_id');

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const summary = typeof body.summary === 'string' ? body.summary.trim() : '';
  const subjective = typeof body.subjective === 'string' ? body.subjective.trim() : '';
  const objective = typeof body.objective === 'string' ? body.objective.trim() : '';
  const assessment = typeof body.assessment === 'string' ? body.assessment.trim() : '';
  const plan = typeof body.plan === 'string' ? body.plan.trim() : '';
  const diagnosis = typeof body.diagnosis === 'string' ? body.diagnosis.trim() : '';

  const composedSummary =
    summary ||
    [
      subjective ? `S: ${subjective}` : '',
      objective ? `O: ${objective}` : '',
      assessment ? `A: ${assessment}` : '',
      plan ? `P: ${plan}` : '',
    ]
      .filter(Boolean)
      .join('\n');

  if (title.length < 2 || title.length > 200) return badRequest('invalid_title');
  if (composedSummary.length < 3) return badRequest('clinical_summary_required');

  const admin = createAstroAdminClient(locals?.runtime?.env);
  const untypedAdmin = admin as unknown as SupabaseClient;
  const doctor = await resolveActiveDoctorId(untypedAdmin, auth.user.id);
  if (!doctor) return forbidden('doctor_profile_required');

  const hasAccess = await verifyDoctorPatientAccess(untypedAdmin, doctor.id, patientId);
  if (!hasAccess) return forbidden('forbidden_patient_access');

  const allowedKinds = new Set(['evolution', 'soap', 'clinical_note', 'follow_up_note']);
  const kind =
    typeof body.kind === 'string' && allowedKinds.has(body.kind.trim())
      ? body.kind.trim()
      : 'evolution';

  const safeType = normalizeClinicalRecordType(body.type);
  const allowedVisibilities = new Set(['care_team', 'patient', 'private', 'normal']);
  const visibility =
    typeof body.visibility === 'string' && allowedVisibilities.has(body.visibility.trim())
      ? body.visibility.trim()
      : 'care_team';

  const appointmentId =
    typeof body.appointmentId === 'string' && isValidUuid(body.appointmentId)
      ? body.appointmentId.trim()
      : null;

  const content: Record<string, unknown> = {
    kind,
    summary: composedSummary,
    ...(diagnosis ? { diagnosis } : {}),
    ...(subjective ? { subjective } : {}),
    ...(objective ? { objective } : {}),
    ...(assessment ? { assessment } : {}),
    ...(plan ? { plan } : {}),
    recordedByUserId: auth.user.id,
  };

  try {
    const { data, error } = await untypedAdmin
      .from('medical_records')
      .insert({
        patient_id: patientId,
        doctor_id: doctor.id,
        appointment_id: appointmentId,
        type: safeType,
        title,
        content,
        visibility,
        date_recorded: new Date().toISOString(),
      })
      .select('id, patient_id, doctor_id, type, title, content, visibility, date_recorded, created_at')
      .single();

    if (error) {
      logger.error('[api/doctors/medical-records] POST insert failed', error);
      return internalError('medical_record_insert_failed');
    }

    return jsonOk(data, 201);
  } catch (err) {
    logger.error('[api/doctors/medical-records] POST error:', err);
    return internalError();
  }
};
