import type { SupabaseClient } from '@supabase/supabase-js';

export type VitalAlertSeverity = 'warning' | 'critical';

export interface VitalAlert {
  code: string;
  severity: VitalAlertSeverity;
  metric: string;
  labelEs: string;
  labelPt: string;
}

export interface VitalSignInput {
  bloodPressureSystolic?: number | null;
  bloodPressureDiastolic?: number | null;
  heartRate?: number | null;
  temperature?: number | null;
  oxygenSaturation?: number | null;
  respiratoryRate?: number | null;
  weight?: number | null;
  height?: number | null;
  painScale?: number | null;
  notes?: string | null;
  measurementContext?: string | null;
}

export type SafeMedicalRecordType =
  | 'consultation'
  | 'diagnosis'
  | 'lab_result'
  | 'imaging';

export type SafeVitalRecordType =
  | 'blood_pressure'
  | 'heart_rate'
  | 'temperature'
  | 'oxygen_saturation'
  | 'respiratory_rate'
  | 'weight'
  | 'height'
  | 'pain_scale'
  | 'composite';

export type RenewalStatus = 'active' | 'expiring_soon' | 'expired' | 'cancelled';

export interface PrescriptionRenewalPrefillItem {
  medicationName: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export interface PrescriptionRenewalInfo {
  id: string;
  cuir: string | null;
  status: string;
  createdAt: string;
  validUntil: string | null;
  daysRemaining: number | null;
  renewalStatus: RenewalStatus;
  canRenew: boolean;
  medicationName: string;
  dosage: string;
  diagnosis: string;
  notes: string;
  signedPdfUrl: string | null;
  prefill: {
    medicationName: string;
    dosage: string;
    frequency: string;
    duration: string;
    diagnosis: string;
    instructions: string;
    items: PrescriptionRenewalPrefillItem[];
  };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXPIRING_SOON_DAYS = 7;
const DEFAULT_VALIDITY_DAYS = 30;
const MS_PER_DAY = 86_400_000;

export function isValidUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

/**
 * Normalize medical_records.type to the intersection of both DB CHECK constraints
 * (`chk_medical_records_type` and `medical_records_type_check`).
 */
export function normalizeClinicalRecordType(raw: unknown): SafeMedicalRecordType {
  const val = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (val === 'diagnosis' || val === 'lab_result' || val === 'imaging') {
    return val;
  }
  return 'consultation';
}

export function validateVitalRanges(input: VitalSignInput): string | null {
  const sys = input.bloodPressureSystolic;
  const dia = input.bloodPressureDiastolic;
  if ((sys != null && dia == null) || (sys == null && dia != null)) {
    return 'vital_bp_requires_systolic_and_diastolic';
  }
  if (sys != null && (!Number.isFinite(sys) || sys < 40 || sys > 300)) {
    return 'vital_systolic_out_of_range';
  }
  if (dia != null && (!Number.isFinite(dia) || dia < 20 || dia > 200)) {
    return 'vital_diastolic_out_of_range';
  }
  if (sys != null && dia != null && dia >= sys) {
    return 'vital_diastolic_must_be_below_systolic';
  }
  if (
    input.heartRate != null &&
    (!Number.isFinite(input.heartRate) || input.heartRate < 20 || input.heartRate > 260)
  ) {
    return 'vital_heart_rate_out_of_range';
  }
  if (
    input.temperature != null &&
    (!Number.isFinite(input.temperature) || input.temperature < 30 || input.temperature > 45)
  ) {
    return 'vital_temperature_out_of_range';
  }
  if (
    input.oxygenSaturation != null &&
    (!Number.isFinite(input.oxygenSaturation) ||
      input.oxygenSaturation < 50 ||
      input.oxygenSaturation > 100)
  ) {
    return 'vital_oxygen_saturation_out_of_range';
  }
  if (
    input.respiratoryRate != null &&
    (!Number.isFinite(input.respiratoryRate) ||
      input.respiratoryRate < 5 ||
      input.respiratoryRate > 80)
  ) {
    return 'vital_respiratory_rate_out_of_range';
  }
  if (
    input.weight != null &&
    (!Number.isFinite(input.weight) || input.weight < 1 || input.weight > 500)
  ) {
    return 'vital_weight_out_of_range';
  }
  if (
    input.height != null &&
    (!Number.isFinite(input.height) || input.height < 30 || input.height > 280)
  ) {
    return 'vital_height_out_of_range';
  }
  if (
    input.painScale != null &&
    (!Number.isFinite(input.painScale) || input.painScale < 0 || input.painScale > 10)
  ) {
    return 'vital_pain_scale_out_of_range';
  }

  const hasAny =
    sys != null ||
    input.heartRate != null ||
    input.temperature != null ||
    input.oxygenSaturation != null ||
    input.respiratoryRate != null ||
    input.weight != null ||
    input.height != null ||
    input.painScale != null;

  return hasAny ? null : 'vital_at_least_one_metric_required';
}

export function computeBmi(weightKg: number | null | undefined, heightCm: number | null | undefined): number | null {
  if (weightKg == null || heightCm == null || heightCm <= 0 || weightKg <= 0) return null;
  const hMeters = heightCm / 100;
  const bmi = Math.round((weightKg / (hMeters * hMeters)) * 10) / 10;
  if (!Number.isFinite(bmi) || bmi < 5 || bmi > 100) return null;
  return bmi;
}

export function resolveVitalRecordType(input: VitalSignInput): SafeVitalRecordType {
  const categories: SafeVitalRecordType[] = [];
  if (input.bloodPressureSystolic != null && input.bloodPressureDiastolic != null) {
    categories.push('blood_pressure');
  }
  if (input.heartRate != null) categories.push('heart_rate');
  if (input.temperature != null) categories.push('temperature');
  if (input.oxygenSaturation != null) categories.push('oxygen_saturation');
  if (input.respiratoryRate != null) categories.push('respiratory_rate');
  if (input.weight != null) categories.push('weight');
  if (input.height != null) categories.push('height');
  if (input.painScale != null) categories.push('pain_scale');

  if (categories.length === 1) return categories[0];
  return 'composite';
}

export function computeVitalAlerts(input: VitalSignInput): VitalAlert[] {
  const alerts: VitalAlert[] = [];
  const sys = input.bloodPressureSystolic;
  const dia = input.bloodPressureDiastolic;

  if (sys != null && dia != null) {
    if (sys >= 180 || dia >= 120) {
      alerts.push({
        code: 'bp_crisis',
        severity: 'critical',
        metric: 'blood_pressure',
        labelEs: `Crisis hipertensiva (${sys}/${dia} mmHg)`,
        labelPt: `Crise hipertensiva (${sys}/${dia} mmHg)`,
      });
    } else if (sys >= 140 || dia >= 90) {
      alerts.push({
        code: 'bp_elevated',
        severity: 'warning',
        metric: 'blood_pressure',
        labelEs: `Presión elevada (${sys}/${dia} mmHg)`,
        labelPt: `Pressão elevada (${sys}/${dia} mmHg)`,
      });
    } else if (sys < 90 || dia < 60) {
      alerts.push({
        code: 'bp_low',
        severity: 'warning',
        metric: 'blood_pressure',
        labelEs: `Hipotensión (${sys}/${dia} mmHg)`,
        labelPt: `Hipotensão (${sys}/${dia} mmHg)`,
      });
    }
  }

  if (input.heartRate != null) {
    if (input.heartRate > 120 || input.heartRate < 45) {
      alerts.push({
        code: 'hr_critical',
        severity: 'critical',
        metric: 'heart_rate',
        labelEs: `FC crítica (${input.heartRate} lpm)`,
        labelPt: `FC crítica (${input.heartRate} bpm)`,
      });
    } else if (input.heartRate > 100 || input.heartRate < 50) {
      alerts.push({
        code: 'hr_abnormal',
        severity: 'warning',
        metric: 'heart_rate',
        labelEs: `FC alterada (${input.heartRate} lpm)`,
        labelPt: `FC alterada (${input.heartRate} bpm)`,
      });
    }
  }

  if (input.oxygenSaturation != null) {
    if (input.oxygenSaturation < 90) {
      alerts.push({
        code: 'spo2_critical',
        severity: 'critical',
        metric: 'oxygen_saturation',
        labelEs: `Hipoxemia severa (SpO2 ${input.oxygenSaturation}%)`,
        labelPt: `Hipoxemia grave (SpO2 ${input.oxygenSaturation}%)`,
      });
    } else if (input.oxygenSaturation < 94) {
      alerts.push({
        code: 'spo2_low',
        severity: 'warning',
        metric: 'oxygen_saturation',
        labelEs: `Saturación baja (SpO2 ${input.oxygenSaturation}%)`,
        labelPt: `Saturação baixa (SpO2 ${input.oxygenSaturation}%)`,
      });
    }
  }

  if (input.temperature != null) {
    if (input.temperature >= 39.0) {
      alerts.push({
        code: 'temp_high_fever',
        severity: 'critical',
        metric: 'temperature',
        labelEs: `Fiebre alta (${input.temperature} °C)`,
        labelPt: `Febre alta (${input.temperature} °C)`,
      });
    } else if (input.temperature >= 37.8 || input.temperature < 35.5) {
      alerts.push({
        code: 'temp_abnormal',
        severity: 'warning',
        metric: 'temperature',
        labelEs: `Temperatura alterada (${input.temperature} °C)`,
        labelPt: `Temperatura alterada (${input.temperature} °C)`,
      });
    }
  }

  if (input.painScale != null && input.painScale >= 7) {
    alerts.push({
      code: input.painScale >= 8 ? 'pain_severe' : 'pain_high',
      severity: input.painScale >= 8 ? 'critical' : 'warning',
      metric: 'pain_scale',
      labelEs: `Dolor intenso (${input.painScale}/10)`,
      labelPt: `Dor intensa (${input.painScale}/10)`,
    });
  }

  return alerts;
}

export interface RawPrescriptionRow {
  id: string;
  cuir?: string | null;
  status?: string | null;
  created_at: string;
  expires_at?: string | null;
  clinical_data?: Record<string, unknown> | null;
  signed_pdf_url?: string | null;
}

export function computePrescriptionRenewalStatus(
  rx: RawPrescriptionRow,
  now: Date = new Date(),
): PrescriptionRenewalInfo {
  const status = String(rx.status ?? 'draft').toLowerCase();
  const clinical = (rx.clinical_data ?? {}) as Record<string, unknown>;
  const rawItems = Array.isArray(clinical.items)
    ? (clinical.items as Array<Record<string, unknown>>)
    : [];

  const items: PrescriptionRenewalPrefillItem[] = rawItems
    .map((item) => ({
      medicationName: String(
        item.generic_name ?? item.commercial_name ?? item.medication_name ?? '',
      ).trim(),
      dosage: String(item.dosage ?? '').trim(),
      frequency: String(item.frequency ?? '').trim(),
      duration: String(item.duration ?? '').trim(),
      instructions: String(item.instructions ?? '').trim(),
    }))
    .filter((item) => item.medicationName.length > 0);

  if (items.length === 0 && typeof clinical.medication_name === 'string' && clinical.medication_name.trim()) {
    items.push({
      medicationName: clinical.medication_name.trim(),
      dosage: String(clinical.dosage ?? '').trim(),
      frequency: String(clinical.frequency ?? '').trim(),
      duration: String(clinical.duration ?? '').trim(),
      instructions: String(clinical.instructions ?? '').trim(),
    });
  }

  const primary = items[0] ?? {
    medicationName: 'Prescripción',
    dosage: '',
    frequency: '',
    duration: '',
    instructions: '',
  };

  const createdMs = Date.parse(rx.created_at);
  let validUntilMs = rx.expires_at ? Date.parse(rx.expires_at) : Number.NaN;
  if (!Number.isFinite(validUntilMs) && Number.isFinite(createdMs)) {
    validUntilMs = createdMs + DEFAULT_VALIDITY_DAYS * MS_PER_DAY;
  }

  const validUntil = Number.isFinite(validUntilMs)
    ? new Date(validUntilMs).toISOString()
    : null;
  const daysRemaining = Number.isFinite(validUntilMs)
    ? Math.ceil((validUntilMs - now.getTime()) / MS_PER_DAY)
    : null;

  let renewalStatus: RenewalStatus = 'active';
  if (status === 'cancelled' || status === 'voided') {
    renewalStatus = 'cancelled';
  } else if (status === 'expired' || (daysRemaining !== null && daysRemaining < 0)) {
    renewalStatus = 'expired';
  } else if (daysRemaining !== null && daysRemaining <= EXPIRING_SOON_DAYS) {
    renewalStatus = 'expiring_soon';
  }

  const diagnosis = String(clinical.diagnosis ?? '').trim();
  const notes = String(clinical.notes ?? '').trim();

  return {
    id: rx.id,
    cuir: rx.cuir ?? null,
    status,
    createdAt: rx.created_at,
    validUntil,
    daysRemaining,
    renewalStatus,
    canRenew: renewalStatus !== 'cancelled',
    medicationName: primary.medicationName,
    dosage: primary.dosage,
    diagnosis,
    notes,
    signedPdfUrl: rx.signed_pdf_url ?? null,
    prefill: {
      medicationName: primary.medicationName,
      dosage: primary.dosage,
      frequency: primary.frequency,
      duration: primary.duration,
      diagnosis,
      instructions: primary.instructions || notes,
      items,
    },
  };
}

export async function resolveActiveDoctorId(
  admin: SupabaseClient,
  userId: string,
): Promise<{ id: string; careCountry: string | null } | null> {
  const { data, error } = await admin
    .from('doctors')
    .select('id, active, care_country')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data?.id || data.active !== true) return null;
  return {
    id: String(data.id),
    careCountry: typeof data.care_country === 'string' ? data.care_country : null,
  };
}

export async function verifyDoctorPatientAccess(
  admin: SupabaseClient,
  doctorId: string,
  patientId: string,
): Promise<boolean> {
  if (!isValidUuid(doctorId) || !isValidUuid(patientId)) return false;

  const [careTeam, appt, privateIdentity, legacyRel] = await Promise.all([
    admin
      .from('patient_care_team')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('patient_id', patientId)
      .eq('active', true)
      .limit(1)
      .maybeSingle(),
    admin
      .from('appointments')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('patient_id', patientId)
      .neq('status', 'cancelled')
      .limit(1)
      .maybeSingle(),
    admin
      .from('patient_private_identities')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('patient_id', patientId)
      .limit(1)
      .maybeSingle(),
    admin
      .from('doctor_patient')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('patient_id', patientId)
      .limit(1)
      .maybeSingle(),
  ]);

  return Boolean(
    careTeam.data?.id ||
      appt.data?.id ||
      privateIdentity.data?.id ||
      legacyRel.data?.id,
  );
}
