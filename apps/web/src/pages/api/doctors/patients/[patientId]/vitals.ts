import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DOCTOR_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { badRequest, forbidden, internalError, jsonOk } from '@/lib/api-helpers';
import {
  computeBmi,
  computeVitalAlerts,
  isValidUuid,
  resolveActiveDoctorId,
  resolveVitalRecordType,
  validateVitalRanges,
  type VitalSignInput,
} from '@/lib/doctors/services/patient-clinical-workspace';
import { createAstroAdminClient } from '@/lib/supabase';
import { logger } from '@autamedica/shared';

interface RawVitalRow {
  id: string;
  patient_id: string;
  type: string;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  heart_rate: number | null;
  temperature: number | null;
  oxygen_saturation: number | null;
  respiratory_rate: number | null;
  weight: number | null;
  height: number | null;
  bmi: number | null;
  pain_scale: number | null;
  notes: string | null;
  measurement_context: string;
  measured_at: string;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : Number.NaN;
}

function rowToVitalInput(row: RawVitalRow): VitalSignInput {
  return {
    bloodPressureSystolic: row.blood_pressure_systolic,
    bloodPressureDiastolic: row.blood_pressure_diastolic,
    heartRate: row.heart_rate,
    temperature: row.temperature != null ? Number(row.temperature) : null,
    oxygenSaturation: row.oxygen_saturation,
    respiratoryRate: row.respiratory_rate,
    weight: row.weight != null ? Number(row.weight) : null,
    height: row.height,
    painScale: row.pain_scale,
    notes: row.notes,
    measurementContext: row.measurement_context,
  };
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  const patientId = params.patientId?.trim() ?? '';
  if (!isValidUuid(patientId)) return badRequest('invalid_patient_id');

  const admin = createAstroAdminClient(locals?.runtime?.env) as unknown as SupabaseClient;
  const doctor = await resolveActiveDoctorId(admin, auth.user.id);
  if (!doctor) return forbidden('doctor_profile_required');

  const { verifyDoctorPatientAccess } = await import(
    '@/lib/doctors/services/patient-clinical-workspace'
  );
  if (!(await verifyDoctorPatientAccess(admin, doctor.id, patientId))) {
    return forbidden('forbidden_patient_access');
  }

  const { data, error } = await admin
    .from('vital_signs')
    .select(
      'id, patient_id, type, blood_pressure_systolic, blood_pressure_diastolic, heart_rate, temperature, oxygen_saturation, respiratory_rate, weight, height, bmi, pain_scale, notes, measurement_context, measured_at',
    )
    .eq('patient_id', patientId)
    .is('deleted_at', null)
    .order('measured_at', { ascending: false })
    .limit(30);

  if (error) {
    logger.error('[api/doctors/patients/vitals] GET failed', error);
    return internalError('vitals_fetch_failed');
  }

  const vitals = (data ?? []) as RawVitalRow[];
  const latest = vitals[0] ?? null;
  const alerts = latest ? computeVitalAlerts(rowToVitalInput(latest)) : [];

  return jsonOk({ vitals, latest, alerts });
};

export const POST: APIRoute = async ({ params, request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  const patientId = params.patientId?.trim() ?? '';
  if (!isValidUuid(patientId)) return badRequest('invalid_patient_id');

  let rawBody: Record<string, unknown>;
  try {
    rawBody = (await request.json()) as Record<string, unknown>;
  } catch {
    return badRequest('invalid_json');
  }

  const input: VitalSignInput = {
    bloodPressureSystolic: toNumberOrNull(
      rawBody.bloodPressureSystolic ?? rawBody.blood_pressure_systolic,
    ),
    bloodPressureDiastolic: toNumberOrNull(
      rawBody.bloodPressureDiastolic ?? rawBody.blood_pressure_diastolic,
    ),
    heartRate: toNumberOrNull(rawBody.heartRate ?? rawBody.heart_rate),
    temperature: toNumberOrNull(rawBody.temperature),
    oxygenSaturation: toNumberOrNull(rawBody.oxygenSaturation ?? rawBody.oxygen_saturation),
    respiratoryRate: toNumberOrNull(rawBody.respiratoryRate ?? rawBody.respiratory_rate),
    weight: toNumberOrNull(rawBody.weight),
    height: toNumberOrNull(rawBody.height),
    painScale: toNumberOrNull(rawBody.painScale ?? rawBody.pain_scale),
    notes: typeof rawBody.notes === 'string' ? rawBody.notes.trim().slice(0, 500) : null,
  };

  const validationError = validateVitalRanges(input);
  if (validationError) return badRequest(validationError);

  const admin = createAstroAdminClient(locals?.runtime?.env) as unknown as SupabaseClient;
  const doctor = await resolveActiveDoctorId(admin, auth.user.id);
  if (!doctor) return forbidden('doctor_profile_required');

  const { verifyDoctorPatientAccess } = await import(
    '@/lib/doctors/services/patient-clinical-workspace'
  );
  if (!(await verifyDoctorPatientAccess(admin, doctor.id, patientId))) {
    return forbidden('forbidden_patient_access');
  }

  const bmi = computeBmi(input.weight, input.height);
  const recordType = resolveVitalRecordType(input);
  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from('vital_signs')
    .insert({
      patient_id: patientId,
      recorded_by_id: auth.user.id,
      type: recordType,
      blood_pressure_systolic:
        input.bloodPressureSystolic != null ? Math.round(input.bloodPressureSystolic) : null,
      blood_pressure_diastolic:
        input.bloodPressureDiastolic != null ? Math.round(input.bloodPressureDiastolic) : null,
      heart_rate: input.heartRate != null ? Math.round(input.heartRate) : null,
      temperature: input.temperature != null ? Math.round(input.temperature * 10) / 10 : null,
      oxygen_saturation:
        input.oxygenSaturation != null ? Math.round(input.oxygenSaturation) : null,
      respiratory_rate: input.respiratoryRate != null ? Math.round(input.respiratoryRate) : null,
      weight: input.weight != null ? Math.round(input.weight * 100) / 100 : null,
      height: input.height != null ? Math.round(input.height) : null,
      bmi,
      pain_scale: input.painScale != null ? Math.round(input.painScale) : null,
      notes: input.notes || null,
      measurement_context: 'clinical_visit',
      measured_at: nowIso,
      recorded_at: nowIso,
    })
    .select(
      'id, patient_id, type, blood_pressure_systolic, blood_pressure_diastolic, heart_rate, temperature, oxygen_saturation, respiratory_rate, weight, height, bmi, pain_scale, notes, measurement_context, measured_at',
    )
    .single();

  if (error) {
    logger.error('[api/doctors/patients/vitals] POST insert failed', error);
    return internalError('vitals_insert_failed');
  }

  const vital = data as RawVitalRow;
  return jsonOk({ vital, alerts: computeVitalAlerts(input) }, 201);
};
