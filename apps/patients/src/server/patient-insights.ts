import { createHash } from 'node:crypto';
import { computeAgeFromIso } from '@/lib/demographics';
import type {
  DashboardAppointmentSummary,
  DashboardMedicationSummary,
  DashboardPriority,
  DashboardResultSummary,
  DashboardScreeningSummary,
  DashboardSummary,
} from '@/types/dashboard-summary';
import type {
  PatientDeterministicAlert,
  PatientAiAnalysisRequest,
  PatientInsightsPayload,
  PatientSnapshot,
  PatientSnapshotVitals,
} from '@/types/patient-snapshot';
import { createAdminClient, createRouteHandlerClient } from '@autamedica/auth/server';
import { logger } from '@autamedica/shared';
import type { Database, Json, TablesInsert } from '@autamedica/types';

type InsightsSupabaseClient =
  | Awaited<ReturnType<typeof createRouteHandlerClient>>
  | ReturnType<typeof createAdminClient>;

type AppointmentRow = Database['public']['Tables']['appointments']['Row'] & {
  doctor: {
    first_name: string | null;
    last_name: string | null;
    specialty: string | null;
  } | null;
};
type LabResultRow = Database['public']['Tables']['lab_results']['Row'];
type MedicalRecordRow = Database['public']['Tables']['medical_records']['Row'];
type PatientRow = Database['public']['Tables']['patients']['Row'];
type PatientScreeningRow = Database['public']['Tables']['patient_screenings']['Row'] & {
  screening: Pick<
    Database['public']['Tables']['preventive_screenings']['Row'],
    'id' | 'name' | 'category'
  > | null;
};
type RecommendedScreeningRow =
  Database['public']['Functions']['get_recommended_screenings']['Returns'][number];
type SymptomRow = Database['public']['Tables']['symptom_reports']['Row'];
type MedicationLogRow = Database['public']['Tables']['medication_logs']['Row'];
type VitalSignRow = Database['public']['Tables']['vital_signs']['Row'];
type AnamnesisRow = Database['public']['Tables']['anamnesis']['Row'];

interface RecommendedScreeningsRpcClient {
  rpc(
    _fn: 'get_recommended_screenings',
    _args: { patient_id_param: string; include_overdue: boolean },
  ): Promise<{
    data: RecommendedScreeningRow[] | null;
    error: unknown;
  }>;
}

type DerivedAlertInsertRow = TablesInsert<'patient_derived_alerts'>;

interface DerivedAlertStoreRow {
  id: string;
  fingerprint: string;
  status: string;
  first_detected_at: string;
  acknowledged_at: string | null;
  acknowledged_by_id: string | null;
  resolved_at: string | null;
}

interface DerivedAlertPublicRow extends DerivedAlertStoreRow {
  patient_id: string;
  source_kind: string;
  snapshot_version: string;
  rule_id: string | null;
  category: string;
  severity: string;
  title: string;
  description: string;
  evidence_json: Json;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface DerivedAlertSelectQuery<T> extends PromiseLike<{ data: T[] | null; error: unknown }> {
  eq(_column: string, _value: string): DerivedAlertSelectQuery<T>;
  is(_column: string, _value: null): DerivedAlertSelectQuery<T>;
  order(
    _column: string,
    _options: { ascending: boolean },
  ): DerivedAlertSelectQuery<T>;
}

interface DerivedAlertUpdateQuery extends PromiseLike<{ data: null; error: unknown }> {
  eq(_column: string, _value: string): DerivedAlertUpdateQuery;
  in(_column: string, _values: string[]): DerivedAlertUpdateQuery;
}

interface DerivedAlertTableGateway {
  select(_columns: string): DerivedAlertSelectQuery<DerivedAlertPublicRow>;
  upsert(
    _values: DerivedAlertInsertRow[],
    _options: { onConflict: string },
  ): Promise<{ error: unknown }>;
  update(
    _values: Partial<DerivedAlertInsertRow> & { updated_at?: string; resolved_at?: string | null; status?: string },
  ): DerivedAlertUpdateQuery;
}

interface DerivedAlertClient {
  from(_table: 'patient_derived_alerts'): DerivedAlertTableGateway;
}

function toObject(value: Json | null): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function toStringArray(value: Json | null): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item === 'string') {
      return item;
    }

    if (item && typeof item === 'object') {
      const record = item as Record<string, unknown>;
      const label =
        typeof record.name === 'string'
          ? record.name
          : typeof record.allergen === 'string'
            ? record.allergen
            : null;

      return label ? [label] : [];
    }

    return [];
  });
}

function isPrescriptionActive(record: MedicalRecordRow): boolean {
  const content = toObject(record.content as Json | null);
  const status = typeof content.status === 'string' ? content.status.toLowerCase() : null;

  if (status === 'active' || status === 'activa') {
    return true;
  }

  if (
    status === 'completed' ||
    status === 'completada' ||
    status === 'cancelled' ||
    status === 'cancelada'
  ) {
    return false;
  }

  const endDate = typeof content.end_date === 'string' ? content.end_date : null;
  return !endDate || new Date(endDate).getTime() >= Date.now();
}

function formatDoctorName(doctor: AppointmentRow['doctor']): string | null {
  if (!doctor) {
    return null;
  }

  const fullName = [doctor.first_name, doctor.last_name].filter(Boolean).join(' ').trim();
  return fullName || null;
}

function normalizeAppointment(row: AppointmentRow): DashboardAppointmentSummary {
  const startDate = new Date(row.start_time);
  const now = new Date();

  return {
    id: row.id,
    startTime: row.start_time,
    status: row.status,
    type: row.type,
    meetingUrl: row.meeting_url,
    location: row.location,
    doctorName: formatDoctorName(row.doctor),
    doctorSpecialty: row.doctor?.specialty ?? null,
    isToday: startDate.toDateString() === now.toDateString(),
  };
}

function normalizeMedication(record: MedicalRecordRow): DashboardMedicationSummary {
  const content = toObject(record.content as Json | null);
  const name = typeof content.medication_name === 'string' ? content.medication_name : record.title;

  return {
    id: record.id,
    name,
    dosage: typeof content.dosage === 'string' ? content.dosage : 'No especificado',
    frequency:
      typeof content.frequency === 'string' ? content.frequency : 'Según indicación médica',
    status: typeof content.status === 'string' ? content.status : 'active',
    startDate: record.created_at,
    notes: typeof content.notes === 'string' ? content.notes : null,
  };
}

function normalizeScreeningStatus(status: string): DashboardScreeningSummary['status'] {
  if (status === 'completed') {
    return 'up_to_date';
  }

  if (status === 'overdue') {
    return 'overdue';
  }

  return 'due_soon';
}

function screeningStatusPriority(
  status: DashboardScreeningSummary['status'],
): DashboardScreeningSummary['priority'] {
  if (status === 'overdue') {
    return 'high';
  }

  if (status === 'due_soon') {
    return 'medium';
  }

  return 'low';
}

function normalizeScreening(item: PatientScreeningRow): DashboardScreeningSummary {
  const status = normalizeScreeningStatus(item.status);

  return {
    id: item.screening_id,
    title: item.screening?.name ?? 'Screening preventivo',
    status,
    priority: screeningStatusPriority(status),
    category: item.screening?.category ?? 'general',
    nextDueDate: item.next_due_date ?? item.scheduled_date,
  };
}

function normalizeRecommendedScreening(item: RecommendedScreeningRow): DashboardScreeningSummary {
  const status = normalizeScreeningStatus(item.status);
  const priority =
    item.urgency === 'high' ? 'high' : item.urgency === 'medium' ? 'medium' : 'low';

  return {
    id: item.screening_id,
    title: item.screening_name,
    status,
    priority,
    category: item.category,
    nextDueDate: item.next_due_date,
  };
}

function normalizeResult(row: LabResultRow): DashboardResultSummary {
  return {
    id: row.id,
    testType: row.test_type,
    testDate: row.test_date,
    status: row.status,
    laboratoryName: row.laboratory_name,
    notes: row.notes,
    reviewedAt: row.reviewed_at,
  };
}

function normalizeVitals(row: VitalSignRow | null): PatientSnapshotVitals | null {
  if (!row) {
    return null;
  }

  return {
    measuredAt: row.measured_at,
    bloodPressure:
      row.blood_pressure_systolic && row.blood_pressure_diastolic
        ? `${row.blood_pressure_systolic}/${row.blood_pressure_diastolic}`
        : null,
    systolic: row.blood_pressure_systolic ?? null,
    diastolic: row.blood_pressure_diastolic ?? null,
    heartRate: row.heart_rate ?? null,
    temperature: row.temperature ?? null,
    oxygenSaturation: row.oxygen_saturation ?? null,
    weight: row.weight ?? null,
  };
}

function buildMissingSections(snapshot: PatientSnapshot): string[] {
  const missing: string[] = [];

  if (snapshot.appointments.upcoming.length === 0) {
    missing.push('appointments');
  }
  if (snapshot.history.anamnesisCompletion === null) {
    missing.push('anamnesis');
  }
  if (snapshot.history.activeConditions.length === 0 && snapshot.history.activeMedications.length === 0) {
    missing.push('medical_history');
  }
  if (snapshot.results.recent.length === 0) {
    missing.push('lab_results');
  }
  if (snapshot.prevention.items.length === 0) {
    missing.push('preventive_screenings');
  }
  if (
    snapshot.observations.recentSymptoms.length === 0 &&
    snapshot.observations.lastVitals === null &&
    snapshot.observations.recentMedicationLogs.length === 0
  ) {
    missing.push('observations');
  }

  return missing;
}

function buildPriorities(summary: Omit<DashboardSummary, 'generatedAt' | 'priorities'>): DashboardPriority[] {
  const priorities: DashboardPriority[] = [];

  if (summary.agenda.nextAppointment?.isToday) {
    priorities.push({
      id: 'next-appointment-today',
      title: 'Tienes una consulta para hoy',
      description: summary.agenda.nextAppointment.doctorName
        ? `Tu próxima cita es con ${summary.agenda.nextAppointment.doctorName}.`
        : 'Revisa el horario y prepara tu consulta.',
      href: '/appointments',
      tone: 'critical',
    });
  } else if (summary.agenda.nextAppointment) {
    priorities.push({
      id: 'next-appointment',
      title: 'Tu próxima consulta ya está agendada',
      description: 'Confirma el horario y revisa indicaciones previas si corresponde.',
      href: '/appointments',
      tone: 'stable',
    });
  }

  if (summary.prevention.overdue > 0) {
    priorities.push({
      id: 'overdue-screenings',
      title: 'Hay chequeos preventivos vencidos',
      description: `${summary.prevention.overdue} control(es) requieren seguimiento.`,
      href: '/preventive-health',
      tone: 'critical',
    });
  } else if (summary.prevention.dueSoon > 0) {
    priorities.push({
      id: 'due-soon-screenings',
      title: 'Tienes chequeos próximos por coordinar',
      description: `${summary.prevention.dueSoon} control(es) están por vencer.`,
      href: '/preventive-health',
      tone: 'attention',
    });
  }

  if (summary.results.pendingReviewCount > 0) {
    priorities.push({
      id: 'pending-results',
      title: 'Hay estudios pendientes de revisión',
      description: `${summary.results.pendingReviewCount} resultado(s) aún no fueron revisados.`,
      href: '/results',
      tone: 'attention',
    });
  } else if (summary.results.latest) {
    priorities.push({
      id: 'latest-results',
      title: 'Tus resultados más recientes ya están disponibles',
      description: `Último estudio cargado: ${summary.results.latest.testType}.`,
      href: '/results',
      tone: 'stable',
    });
  }

  if ((summary.history.anamnesisCompletion ?? 0) > 0 && (summary.history.anamnesisCompletion ?? 0) < 100) {
    priorities.push({
      id: 'anamnesis-incomplete',
      title: 'Tu anamnesis todavía no está completa',
      description: `Llevas ${summary.history.anamnesisCompletion}% completado.`,
      href: '/anamnesis',
      tone: 'attention',
    });
  }

  if (priorities.length === 0) {
    priorities.push({
      id: 'build-history',
      title: 'Tu panel todavía necesita más datos clínicos',
      description:
        'Completa tu historia clínica o agenda una consulta para personalizar mejor el portal.',
      href: '/medical-history',
      tone: 'stable',
    });
  }

  return priorities.slice(0, 4);
}

function buildDashboardSummary(snapshot: PatientSnapshot): DashboardSummary {
  const baseSummary = {
    agenda: {
      todayCount: snapshot.appointments.todayCount,
      upcomingCount: snapshot.appointments.upcoming.length,
      nextAppointment: snapshot.appointments.next,
    },
    history: {
      activeConditionsCount: snapshot.history.activeConditions.length,
      activeMedicationsCount: snapshot.history.activeMedications.length,
      knownAllergiesCount: snapshot.history.allergies.length,
      lastEncounterDate: snapshot.history.lastEncounterDate,
      chronicConditions: snapshot.history.activeConditions.slice(0, 3).map((item) => item.name),
      criticalAllergies: snapshot.history.allergies.slice(0, 3),
      currentMedications: snapshot.history.activeMedications.slice(0, 4),
      anamnesisCompletion: snapshot.history.anamnesisCompletion,
    },
    prevention: {
      total: snapshot.prevention.total,
      upToDate: snapshot.prevention.upToDate.length,
      dueSoon: snapshot.prevention.dueSoon.length,
      overdue: snapshot.prevention.overdue.length,
      nextItems: [...snapshot.prevention.overdue, ...snapshot.prevention.dueSoon].slice(0, 3),
    },
    observations: {
      recentSymptom: snapshot.observations.recentSymptoms[0]
        ? {
            name: snapshot.observations.recentSymptoms[0].name,
            severity: snapshot.observations.recentSymptoms[0].severity,
            reportedAt: snapshot.observations.recentSymptoms[0].reportedAt,
          }
        : null,
      lastVitals: snapshot.observations.lastVitals
        ? {
            measuredAt: snapshot.observations.lastVitals.measuredAt,
            bloodPressure: snapshot.observations.lastVitals.bloodPressure,
            heartRate: snapshot.observations.lastVitals.heartRate,
            temperature: snapshot.observations.lastVitals.temperature,
            oxygenSaturation: snapshot.observations.lastVitals.oxygenSaturation,
            weight: snapshot.observations.lastVitals.weight,
          }
        : null,
      medicationTakenLast30Days: snapshot.observations.recentMedicationLogs.filter(
        (item) => item.status === 'taken',
      ).length,
      lastMedicationLogAt: snapshot.observations.recentMedicationLogs[0]?.takenAt ?? null,
    },
    results: {
      total: snapshot.results.recent.length,
      pendingReviewCount: snapshot.results.pendingReviewCount,
      latest: snapshot.results.latest,
    },
  };

  return {
    generatedAt: snapshot.generatedAt,
    ...baseSummary,
    priorities: buildPriorities(baseSummary),
  };
}

function buildDeterministicAlerts(snapshot: PatientSnapshot): PatientDeterministicAlert[] {
  const generatedAt = snapshot.generatedAt;
  const alerts: PatientDeterministicAlert[] = [];

  if (snapshot.history.anamnesisCompletion === null) {
    alerts.push({
      id: 'anamnesis-missing',
      ruleId: 'anamnesis_missing',
      severity: 'low',
      category: 'history',
      title: 'Falta cargar la anamnesis',
      description: 'El perfil del paciente todavía no tiene anamnesis registrada.',
      generatedAt,
      evidence: { completion: null },
    });
  } else if (snapshot.history.anamnesisCompletion < 100) {
    alerts.push({
      id: 'anamnesis-incomplete',
      ruleId: 'anamnesis_incomplete',
      severity: 'medium',
      category: 'history',
      title: 'La anamnesis está incompleta',
      description: `La anamnesis se encuentra al ${snapshot.history.anamnesisCompletion}% de completitud.`,
      generatedAt,
      evidence: { completion: snapshot.history.anamnesisCompletion },
    });
  }

  if (snapshot.prevention.overdue.length > 0) {
    alerts.push({
      id: 'preventive-overdue',
      ruleId: 'preventive_overdue',
      severity: 'high',
      category: 'prevention',
      title: 'Hay controles preventivos vencidos',
      description: `${snapshot.prevention.overdue.length} control(es) preventivo(s) requieren seguimiento.`,
      generatedAt,
      evidence: {
        itemIds: snapshot.prevention.overdue.map((item) => item.id),
      },
    });
  }

  if (snapshot.results.pendingReviewCount > 0) {
    alerts.push({
      id: 'results-pending-review',
      ruleId: 'results_pending_review',
      severity: 'medium',
      category: 'results',
      title: 'Hay estudios pendientes de revisión',
      description: `${snapshot.results.pendingReviewCount} resultado(s) todavía no fueron revisados.`,
      generatedAt,
      evidence: {
        latestResultId: snapshot.results.latest?.id ?? null,
        pendingReviewCount: snapshot.results.pendingReviewCount,
      },
    });
  }

  const recentSevereSymptom = snapshot.observations.recentSymptoms.find((item) => {
    const within72Hours = Date.now() - new Date(item.reportedAt).getTime() <= 72 * 60 * 60 * 1000;
    return within72Hours && item.severity >= 8;
  });

  if (recentSevereSymptom) {
    alerts.push({
      id: `symptom-severe-${recentSevereSymptom.id}`,
      ruleId: 'recent_severe_symptom',
      severity: 'critical',
      category: 'symptoms',
      title: 'Se detectó un síntoma severo reciente',
      description: `${recentSevereSymptom.name} fue reportado con severidad ${recentSevereSymptom.severity}.`,
      generatedAt,
      evidence: {
        symptomId: recentSevereSymptom.id,
        name: recentSevereSymptom.name,
        severity: recentSevereSymptom.severity,
        reportedAt: recentSevereSymptom.reportedAt,
      },
    });
  }

  const systolic = snapshot.observations.lastVitals?.systolic ?? null;
  const diastolic = snapshot.observations.lastVitals?.diastolic ?? null;
  if (systolic !== null && diastolic !== null && (systolic >= 140 || diastolic >= 90)) {
    alerts.push({
      id: 'vitals-blood-pressure-out-of-range',
      ruleId: 'blood_pressure_out_of_range',
      severity: systolic >= 180 || diastolic >= 120 ? 'critical' : 'high',
      category: 'vitals',
      title: 'La última presión arterial quedó fuera de rango',
      description: `Último registro: ${systolic}/${diastolic}.`,
      generatedAt,
      evidence: {
        systolic,
        diastolic,
        measuredAt: snapshot.observations.lastVitals?.measuredAt ?? null,
      },
    });
  }

  if (snapshot.appointments.upcoming.length === 0 && alerts.some((item) => item.severity !== 'low')) {
    alerts.push({
      id: 'appointments-missing-follow-up',
      ruleId: 'missing_follow_up',
      severity: 'medium',
      category: 'appointments',
      title: 'No hay seguimiento agendado',
      description:
        'Existen señales clínicas que merecen seguimiento, pero no hay consultas futuras programadas.',
      generatedAt,
      evidence: {
        upcomingAppointments: 0,
        triggeringAlerts: alerts.filter((item) => item.severity !== 'low').map((item) => item.ruleId),
      },
    });
  }

  return alerts;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(',')}}`;
}

function buildAlertFingerprint(alert: PatientDeterministicAlert): string {
  const payload = stableStringify({
    ruleId: alert.ruleId,
    category: alert.category,
    severity: alert.severity,
    title: alert.title,
    description: alert.description,
    evidence: alert.evidence,
  });

  return createHash('sha256').update(payload).digest('hex');
}

export async function syncDeterministicAlerts(
  patientId: string,
  alerts: PatientDeterministicAlert[],
): Promise<void> {
  const admin = createAdminClient() as unknown as DerivedAlertClient;
  const now = new Date().toISOString();
  const { data: existingRows, error: existingError } = await admin
    .from('patient_derived_alerts')
    .select(
      'id, fingerprint, status, first_detected_at, acknowledged_at, acknowledged_by_id, resolved_at',
    )
    .eq('patient_id', patientId)
    .eq('source_kind', 'rule_engine')
    .is('deleted_at', null);

  if (existingError) {
    throw existingError;
  }

  const existingByFingerprint = new Map<string, DerivedAlertPublicRow>(
    (existingRows ?? []).map((row) => [row.fingerprint, row]),
  );

  const upserts: DerivedAlertInsertRow[] = alerts.map((alert) => {
    const fingerprint = buildAlertFingerprint(alert);
    const existing = existingByFingerprint.get(fingerprint);
    const status =
      existing?.status === 'dismissed'
        ? 'dismissed'
        : existing?.status === 'acknowledged'
          ? 'acknowledged'
          : 'open';

    return {
      patient_id: patientId,
      source_kind: 'rule_engine',
      snapshot_version: 'patient_snapshot_v1',
      rule_id: alert.ruleId,
      fingerprint,
      category: alert.category,
      severity: alert.severity,
      title: alert.title,
      description: alert.description,
      evidence_json: alert.evidence as Json,
      status,
      first_detected_at: existing?.first_detected_at ?? now,
      last_detected_at: now,
      acknowledged_at: status === 'acknowledged' ? existing?.acknowledged_at ?? null : null,
      acknowledged_by_id:
        status === 'acknowledged' ? existing?.acknowledged_by_id ?? null : null,
      resolved_at: status === 'dismissed' ? existing?.resolved_at ?? null : null,
    };
  });

  if (upserts.length > 0) {
    const { error: upsertError } = await admin
      .from('patient_derived_alerts')
      .upsert(upserts, { onConflict: 'patient_id,source_kind,fingerprint' });

    if (upsertError) {
      throw upsertError;
    }
  }

  const activeFingerprints = new Set(upserts.map((row) => row.fingerprint));
  const staleIds = (existingRows ?? [])
    .filter(
      (row) =>
        !activeFingerprints.has(row.fingerprint) &&
        (row.status === 'open' || row.status === 'acknowledged'),
    )
    .map((row) => row.id);

  if (staleIds.length > 0) {
    const { error: resolveError } = await admin
      .from('patient_derived_alerts')
      .update({
        status: 'resolved',
        resolved_at: now,
        updated_at: now,
      })
      .in('id', staleIds);

    if (resolveError) {
      throw resolveError;
    }
  }
}

export async function listPersistedDerivedAlerts(
  patientId: string,
): Promise<DerivedAlertPublicRow[]> {
  const admin = createAdminClient() as unknown as DerivedAlertClient;
  const { data, error } = await admin
    .from('patient_derived_alerts')
    .select('*')
    .eq('patient_id', patientId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export function buildPatientAiAnalysisRequest(
  payload: PatientInsightsPayload,
): PatientAiAnalysisRequest {
  return {
    version: 'patient_ai_analysis_request_v1',
    generatedAt: new Date().toISOString(),
    snapshot: payload.snapshot,
    alerts: payload.alerts,
    instructions: {
      objective:
        'Analizar el estado clínico del paciente sin inventar datos y priorizar señales relevantes para seguimiento.',
      rules: [
        'Usa únicamente el snapshot y las alertas recibidas.',
        'No diagnostiques ni indiques tratamiento.',
        'Distingue hechos observados de inferencias.',
        'Si faltan datos críticos, decláralo explícitamente.',
        'No contradigas alertas determinísticas existentes.',
      ],
      outputSchema: {
        overview: 'string',
        riskSignals: [
          {
            severity: 'medium',
            title: 'string',
            rationale: 'string',
          },
        ],
        recommendedActions: [
          {
            priority: 'medium',
            action: 'string',
            reason: 'string',
          },
        ],
        patientFacingSummary: 'string',
      },
    },
  };
}

export async function buildPatientInsights(
  supabase: InsightsSupabaseClient,
  patientId: string,
): Promise<PatientInsightsPayload> {
  const [
    patientResult,
    anamnesisResult,
    appointmentsResult,
    medicalRecordsResult,
    patientScreeningsResult,
    labResultsResult,
    symptomsResult,
    medicationLogsResult,
    vitalSignsResult,
  ] = await Promise.all([
    supabase
      .from('patients')
      .select('birth_date, gender, allergies')
      .eq('id', patientId)
      .maybeSingle(),
    supabase
      .from('anamnesis')
      .select('completion_percentage')
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('appointments')
      .select(`
        *,
        doctor:doctors(
          first_name,
          last_name,
          specialty
        )
      `)
      .eq('patient_id', patientId)
      .in('status', ['scheduled', 'confirmed', 'in_progress'])
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true })
      .limit(10),
    supabase
      .from('medical_records')
      .select('*')
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('patient_screenings')
      .select(`
        *,
        screening:preventive_screenings(
          id,
          name,
          category
        )
      `)
      .eq('patient_id', patientId)
      .order('next_due_date', { ascending: true, nullsFirst: false })
      .limit(20),
    supabase
      .from('lab_results')
      .select('*')
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .order('test_date', { ascending: false })
      .limit(12),
    supabase
      .from('symptom_reports')
      .select('*')
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .order('reported_at', { ascending: false })
      .limit(20),
    supabase
      .from('medication_logs')
      .select('*')
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .order('taken_at', { ascending: false })
      .limit(30),
    supabase
      .from('vital_signs')
      .select('*')
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .order('measured_at', { ascending: false })
      .limit(10),
  ]);

  const admin = createAdminClient();
  const recommendedScreeningsClient = admin as unknown as RecommendedScreeningsRpcClient;
  const recommendedScreeningsResult = await recommendedScreeningsClient.rpc(
    'get_recommended_screenings',
    {
      patient_id_param: patientId,
      include_overdue: true,
    },
  );

  if (patientResult.error) {
    logger.warn('[buildPatientInsights] Unable to load patient row', patientResult.error);
  }
  if (anamnesisResult.error) {
    logger.warn('[buildPatientInsights] Unable to load anamnesis summary', anamnesisResult.error);
  }
  if (appointmentsResult.error) {
    logger.warn('[buildPatientInsights] Unable to load appointments', appointmentsResult.error);
  }
  if (medicalRecordsResult.error) {
    logger.warn('[buildPatientInsights] Unable to load medical records', medicalRecordsResult.error);
  }
  if (patientScreeningsResult.error) {
    logger.warn('[buildPatientInsights] Unable to load patient screenings', patientScreeningsResult.error);
  }
  if (recommendedScreeningsResult.error) {
    logger.warn(
      '[buildPatientInsights] Unable to load screening recommendations',
      recommendedScreeningsResult.error,
    );
  }
  if (labResultsResult.error) {
    logger.warn('[buildPatientInsights] Unable to load lab results', labResultsResult.error);
  }
  if (symptomsResult.error) {
    logger.warn('[buildPatientInsights] Unable to load symptoms', symptomsResult.error);
  }
  if (medicationLogsResult.error) {
    logger.warn('[buildPatientInsights] Unable to load medication logs', medicationLogsResult.error);
  }
  if (vitalSignsResult.error) {
    logger.warn('[buildPatientInsights] Unable to load vital signs', vitalSignsResult.error);
  }

  const patient = patientResult.data as Pick<PatientRow, 'birth_date' | 'gender' | 'allergies'> | null;
  const appointments = ((appointmentsResult.data ?? []) as AppointmentRow[]).map(normalizeAppointment);
  const medicalRecords = (medicalRecordsResult.data ?? []) as MedicalRecordRow[];
  const activeConditions = medicalRecords
    .filter((record) => record.type === 'diagnosis')
    .map((record) => {
      const content = toObject(record.content as Json | null);
      return {
        id: record.id,
        name: record.title,
        recordedAt: record.created_at,
        icd10Code: typeof content.icd10_code === 'string' ? content.icd10_code : null,
      };
    });
  const activeMedications = medicalRecords
    .filter((record) => record.type === 'prescription' && isPrescriptionActive(record))
    .map(normalizeMedication);

  const screeningsById = new Map<string, DashboardScreeningSummary>();
  for (const item of (patientScreeningsResult.data ?? []) as PatientScreeningRow[]) {
    screeningsById.set(item.screening_id, normalizeScreening(item));
  }
  for (const item of (recommendedScreeningsResult.data ?? []) as RecommendedScreeningRow[]) {
    if (!screeningsById.has(item.screening_id)) {
      screeningsById.set(item.screening_id, normalizeRecommendedScreening(item));
    }
  }

  const screeningWeight = { overdue: 0, due_soon: 1, up_to_date: 2 } as const;
  const screenings = Array.from(screeningsById.values()).sort(
    (left, right) => screeningWeight[left.status] - screeningWeight[right.status],
  );
  const recentResults = ((labResultsResult.data ?? []) as LabResultRow[]).map(normalizeResult);
  const recentSymptoms = ((symptomsResult.data ?? []) as SymptomRow[]).map((item) => ({
    id: item.id,
    name: item.symptom_name,
    severity: item.severity,
    reportedAt: item.reported_at,
  }));
  const recentMedicationLogs = ((medicationLogsResult.data ?? []) as MedicationLogRow[]).map((item) => ({
    id: item.id,
    medicationName: item.medication_name,
    dosage: item.dosage,
    status: item.status,
    takenAt: item.taken_at,
  }));
  const vitalSigns = (vitalSignsResult.data ?? []) as VitalSignRow[];
  const anamnesis = anamnesisResult.data as Pick<AnamnesisRow, 'completion_percentage'> | null;

  const snapshotBase: PatientSnapshot = {
    version: 'patient_snapshot_v1',
    generatedAt: new Date().toISOString(),
    patientId,
    profile: {
      birthDate: patient?.birth_date ?? null,
      age: computeAgeFromIso(patient?.birth_date ?? null),
      gender: patient?.gender ?? null,
    },
    history: {
      activeConditions,
      activeMedications,
      allergies: toStringArray((patient?.allergies ?? null) as Json | null),
      anamnesisCompletion:
        typeof anamnesis?.completion_percentage === 'number'
          ? anamnesis.completion_percentage
          : null,
      lastEncounterDate: medicalRecords[0]?.created_at ?? null,
    },
    appointments: {
      next: appointments[0] ?? null,
      upcoming: appointments,
      todayCount: appointments.filter((item) => item.isToday).length,
    },
    results: {
      latest: recentResults[0] ?? null,
      recent: recentResults,
      pendingReviewCount: recentResults.filter((item) => !item.reviewedAt).length,
    },
    prevention: {
      total: screenings.length,
      items: screenings,
      overdue: screenings.filter((item) => item.status === 'overdue'),
      dueSoon: screenings.filter((item) => item.status === 'due_soon'),
      upToDate: screenings.filter((item) => item.status === 'up_to_date'),
    },
    observations: {
      recentSymptoms,
      lastVitals: normalizeVitals(vitalSigns[0] ?? null),
      recentMedicationLogs,
    },
    sourceCounts: {
      appointments: appointments.length,
      medicalRecords: medicalRecords.length,
      labResults: recentResults.length,
      screenings: screenings.length,
      symptoms: recentSymptoms.length,
      medicationLogs: recentMedicationLogs.length,
      vitalSigns: vitalSigns.length,
    },
    missingSections: [],
  };

  const snapshot: PatientSnapshot = {
    ...snapshotBase,
    missingSections: buildMissingSections(snapshotBase),
  };
  const alerts = buildDeterministicAlerts(snapshot);
  const summary = buildDashboardSummary(snapshot);

  return {
    snapshot,
    alerts,
    summary,
  };
}
