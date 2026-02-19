import {
  getCorsHeaders,
  jsonResponse,
  requireAuth,
} from '../_shared/auth-helpers.ts';

type ObservationType = 'vital_sign' | 'medication' | 'symptom' | 'lab_result';

type AlertSeverity = 'info' | 'medium' | 'high' | 'critical';

interface AlertDraft {
  severity: AlertSeverity;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function toBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function toIsoTimestampOrNow(value: unknown): string {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.valueOf())) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}

function assertObservationType(value: unknown): ObservationType {
  if (
    value === 'vital_sign'
    || value === 'medication'
    || value === 'symptom'
    || value === 'lab_result'
  ) {
    return value;
  }

  throw new Error('Invalid observation type');
}

function deriveAlert(type: ObservationType, payload: Record<string, unknown>): AlertDraft | null {
  if (type === 'vital_sign') {
    const systolic = toNumber(payload.blood_pressure_systolic ?? payload.systolic);
    const diastolic = toNumber(payload.blood_pressure_diastolic ?? payload.diastolic);

    if ((systolic !== null && systolic >= 180) || (diastolic !== null && diastolic >= 120)) {
      return {
        severity: 'critical',
        title: 'Blood pressure critical threshold',
        message: 'Blood pressure is in a critical range and requires immediate medical review.',
        metadata: { systolic, diastolic },
      };
    }

    if ((systolic !== null && systolic >= 160) || (diastolic !== null && diastolic >= 100)) {
      return {
        severity: 'high',
        title: 'Blood pressure alert',
        message: 'Blood pressure is above expected range and should be reviewed soon.',
        metadata: { systolic, diastolic },
      };
    }

    return null;
  }

  if (type === 'symptom') {
    const severity = toNumber(payload.severity);
    const isUrgent = toBoolean(payload.is_urgent ?? payload.isUrgent, false);

    if (isUrgent || (severity !== null && severity >= 9)) {
      return {
        severity: 'critical',
        title: 'Urgent symptom reported',
        message: 'A high-severity symptom was reported and requires immediate triage.',
        metadata: { severity, isUrgent },
      };
    }

    if (severity !== null && severity >= 7) {
      return {
        severity: 'high',
        title: 'Severe symptom reported',
        message: 'A severe symptom was reported and should be reviewed promptly.',
        metadata: { severity },
      };
    }

    return null;
  }

  if (type === 'lab_result') {
    const status = toStringOrNull(payload.status);
    if (status === 'flagged') {
      return {
        severity: 'high',
        title: 'Flagged lab result',
        message: 'A lab result was uploaded with flagged status and needs clinical review.',
      };
    }

    return null;
  }

  if (type === 'medication') {
    const status = toStringOrNull(payload.status);
    if (status === 'skipped') {
      return {
        severity: 'medium',
        title: 'Medication skipped',
        message: 'A medication intake was marked as skipped.',
      };
    }

    return null;
  }

  return null;
}

function normalizeLabResultStatus(value: unknown): 'pending' | 'reviewed' | 'flagged' {
  const status = toStringOrNull(value);
  if (status === 'reviewed' || status === 'flagged') {
    return status;
  }

  return 'pending';
}

function normalizeMedicationStatus(value: unknown): 'taken' | 'late' | 'skipped' {
  const status = toStringOrNull(value);
  if (status === 'late' || status === 'skipped') {
    return status;
  }

  return 'taken';
}

async function resolvePatientId(
  serviceClient: Awaited<ReturnType<typeof requireAuth>>['serviceClient'],
  userId: string,
): Promise<string | null> {
  const { data, error } = await serviceClient
    .from('patients')
    .select('id')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve patient profile: ${error.message}`);
  }

  return data?.id ?? null;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      {
        error: 'Method not allowed',
        code: 'METHOD_NOT_ALLOWED',
      },
      405,
      corsHeaders,
    );
  }

  try {
    const { user, serviceClient } = await requireAuth(req, corsHeaders);
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return jsonResponse(
        {
          error: 'Invalid JSON payload',
          code: 'INVALID_JSON',
        },
        400,
        corsHeaders,
      );
    }

    const observationType = assertObservationType((body as Record<string, unknown>).type);
    const payload = (body as Record<string, unknown>).payload;

    if (!payload || typeof payload !== 'object') {
      return jsonResponse(
        {
          error: 'Missing payload object',
          code: 'VALIDATION_ERROR',
        },
        400,
        corsHeaders,
      );
    }

    const patientId = await resolvePatientId(serviceClient, user.id);
    if (!patientId) {
      return jsonResponse(
        {
          error: 'Patient profile not found for authenticated user',
          code: 'PATIENT_NOT_FOUND',
        },
        404,
        corsHeaders,
      );
    }

    const nowIso = new Date().toISOString();
    const observationPayload = payload as Record<string, unknown>;

    let sourceTable: 'vital_signs' | 'medication_logs' | 'symptom_reports' | 'lab_results';
    let insertedRecordId: string;

    if (observationType === 'vital_sign') {
      const type = toStringOrNull(observationPayload.type) ?? 'blood_pressure';
      const systolic = toNumber(observationPayload.blood_pressure_systolic ?? observationPayload.systolic);
      const diastolic = toNumber(observationPayload.blood_pressure_diastolic ?? observationPayload.diastolic);

      if (type === 'blood_pressure' && (systolic === null || diastolic === null)) {
        return jsonResponse(
          {
            error: 'blood_pressure requires systolic and diastolic values',
            code: 'VALIDATION_ERROR',
          },
          400,
          corsHeaders,
        );
      }

      const { data, error } = await serviceClient
        .from('vital_signs')
        .insert({
          patient_id: patientId,
          recorded_by_id: user.id,
          type,
          blood_pressure_systolic: systolic,
          blood_pressure_diastolic: diastolic,
          heart_rate: toNumber(observationPayload.heart_rate),
          temperature: toNumber(observationPayload.temperature),
          oxygen_saturation: toNumber(observationPayload.oxygen_saturation),
          respiratory_rate: toNumber(observationPayload.respiratory_rate),
          weight: toNumber(observationPayload.weight),
          height: toNumber(observationPayload.height),
          bmi: toNumber(observationPayload.bmi),
          pain_scale: toNumber(observationPayload.pain_scale),
          unit: toStringOrNull(observationPayload.unit),
          notes: toStringOrNull(observationPayload.notes),
          measurement_context: toStringOrNull(observationPayload.measurement_context) ?? 'patient_self_report',
          measured_at: toIsoTimestampOrNow(observationPayload.measured_at),
          recorded_at: nowIso,
        })
        .select('id')
        .single();

      if (error || !data) {
        throw new Error(`Failed to insert vital_signs: ${error?.message ?? 'unknown error'}`);
      }

      sourceTable = 'vital_signs';
      insertedRecordId = data.id;
    } else if (observationType === 'medication') {
      const medicationName = toStringOrNull(observationPayload.medication_name ?? observationPayload.medicationName);
      const dosage = toStringOrNull(observationPayload.dosage);

      if (!medicationName || !dosage) {
        return jsonResponse(
          {
            error: 'medication_name and dosage are required',
            code: 'VALIDATION_ERROR',
          },
          400,
          corsHeaders,
        );
      }

      const { data, error } = await serviceClient
        .from('medication_logs')
        .insert({
          patient_id: patientId,
          logged_by_id: user.id,
          medication_name: medicationName,
          dosage,
          status: normalizeMedicationStatus(observationPayload.status),
          notes: toStringOrNull(observationPayload.notes),
          source: toStringOrNull(observationPayload.source) ?? 'patient_portal',
          taken_at: toIsoTimestampOrNow(observationPayload.taken_at),
        })
        .select('id')
        .single();

      if (error || !data) {
        throw new Error(`Failed to insert medication_logs: ${error?.message ?? 'unknown error'}`);
      }

      sourceTable = 'medication_logs';
      insertedRecordId = data.id;
    } else if (observationType === 'symptom') {
      const symptomName = toStringOrNull(observationPayload.symptom_name ?? observationPayload.symptomName);
      const severity = toNumber(observationPayload.severity);

      if (!symptomName || severity === null) {
        return jsonResponse(
          {
            error: 'symptom_name and severity are required',
            code: 'VALIDATION_ERROR',
          },
          400,
          corsHeaders,
        );
      }

      const { data, error } = await serviceClient
        .from('symptom_reports')
        .insert({
          patient_id: patientId,
          reported_by_id: user.id,
          symptom_name: symptomName,
          severity,
          description: toStringOrNull(observationPayload.description),
          duration: toStringOrNull(observationPayload.duration),
          frequency: toStringOrNull(observationPayload.frequency),
          triggers: toStringOrNull(observationPayload.triggers),
          body_location: toStringOrNull(observationPayload.body_location ?? observationPayload.bodyLocation),
          is_urgent: toBoolean(observationPayload.is_urgent ?? observationPayload.isUrgent),
          reported_at: toIsoTimestampOrNow(observationPayload.reported_at),
        })
        .select('id')
        .single();

      if (error || !data) {
        throw new Error(`Failed to insert symptom_reports: ${error?.message ?? 'unknown error'}`);
      }

      sourceTable = 'symptom_reports';
      insertedRecordId = data.id;
    } else {
      const testType = toStringOrNull(observationPayload.test_type ?? observationPayload.testType);
      const testDate = toStringOrNull(observationPayload.test_date ?? observationPayload.testDate);

      if (!testType || !testDate || !/^\d{4}-\d{2}-\d{2}$/.test(testDate)) {
        return jsonResponse(
          {
            error: 'test_type and test_date (YYYY-MM-DD) are required',
            code: 'VALIDATION_ERROR',
          },
          400,
          corsHeaders,
        );
      }

      const status = normalizeLabResultStatus(observationPayload.status);
      const { data, error } = await serviceClient
        .from('lab_results')
        .insert({
          patient_id: patientId,
          uploaded_by_id: user.id,
          test_type: testType,
          test_date: testDate,
          laboratory_name: toStringOrNull(observationPayload.laboratory_name ?? observationPayload.laboratoryName),
          file_url: toStringOrNull(observationPayload.file_url ?? observationPayload.fileUrl),
          file_type: toStringOrNull(observationPayload.file_type ?? observationPayload.fileType),
          notes: toStringOrNull(observationPayload.notes),
          status,
          reviewed_at: status === 'reviewed' ? nowIso : null,
        })
        .select('id')
        .single();

      if (error || !data) {
        throw new Error(`Failed to insert lab_results: ${error?.message ?? 'unknown error'}`);
      }

      sourceTable = 'lab_results';
      insertedRecordId = data.id;
    }

    const alertDraft = deriveAlert(observationType, observationPayload);
    let alertId: string | null = null;

    if (alertDraft) {
      const { data, error } = await serviceClient.rpc('create_patient_alert', {
        p_patient_id: patientId,
        p_source_table: sourceTable,
        p_source_record_id: insertedRecordId,
        p_severity: alertDraft.severity,
        p_title: alertDraft.title,
        p_message: alertDraft.message,
        p_metadata: alertDraft.metadata ?? {},
        p_created_by_id: user.id,
      });

      if (error) {
        console.error('[ingest-patient-observation] Failed to create alert:', error.message);
      } else if (typeof data === 'string') {
        alertId = data;
      }
    }

    return jsonResponse(
      {
        success: true,
        data: {
          source_table: sourceTable,
          source_record_id: insertedRecordId,
          alert_id: alertId,
        },
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    console.error('[ingest-patient-observation] Unexpected error:', error);

    return jsonResponse(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      },
      500,
      corsHeaders,
    );
  }
});
