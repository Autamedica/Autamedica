import { createHash } from 'node:crypto'
import type {
  PatientDeterministicAlert,
  PatientSnapshot,
} from '@/lib/patients/types/patient-snapshot'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'
import type { Json, TablesInsert } from '@autamedica/types'

type DerivedAlertInsertRow = TablesInsert<'patient_derived_alerts'>

interface DerivedAlertStoreRow {
  id: string
  fingerprint: string
  status: string
  first_detected_at: string
  acknowledged_at: string | null
  acknowledged_by_id: string | null
  resolved_at: string | null
}

interface DerivedAlertPublicRow extends DerivedAlertStoreRow {
  patient_id: string
  source_kind: string
  snapshot_version: string
  rule_id: string | null
  category: string
  severity: string
  title: string
  description: string
  evidence_json: Json
  created_at: string
  updated_at: string
  deleted_at: string | null
}

interface DerivedAlertSelectQuery<T> extends PromiseLike<{ data: T[] | null; error: unknown }> {
  eq(_column: string, _value: string): DerivedAlertSelectQuery<T>
  is(_column: string, _value: null): DerivedAlertSelectQuery<T>
  order(
    _column: string,
    _options: { ascending: boolean },
  ): DerivedAlertSelectQuery<T>
}

interface DerivedAlertUpdateQuery extends PromiseLike<{ data: null; error: unknown }> {
  eq(_column: string, _value: string): DerivedAlertUpdateQuery
  in(_column: string, _values: string[]): DerivedAlertUpdateQuery
}

interface DerivedAlertTableGateway {
  select(_columns: string): DerivedAlertSelectQuery<DerivedAlertPublicRow>
  upsert(
    _values: DerivedAlertInsertRow[],
    _options: { onConflict: string },
  ): Promise<{ error: unknown }>
  update(
    _values: Partial<DerivedAlertInsertRow> & { updated_at?: string; resolved_at?: string | null; status?: string },
  ): DerivedAlertUpdateQuery
}

interface DerivedAlertClient {
  from(_table: 'patient_derived_alerts'): DerivedAlertTableGateway
}

export function buildDeterministicAlerts(snapshot: PatientSnapshot): PatientDeterministicAlert[] {
  const generatedAt = snapshot.generatedAt
  const alerts: PatientDeterministicAlert[] = []

  if (snapshot.history.anamnesisCompletion === null) {
    alerts.push({
      id: 'anamnesis-missing',
      ruleId: 'anamnesis_missing',
      severity: 'low',
      category: 'history',
      title: 'Falta cargar la anamnesis',
      description: 'El perfil del paciente todavia no tiene anamnesis registrada.',
      generatedAt,
      evidence: { completion: null },
    })
  } else if (snapshot.history.anamnesisCompletion < 100) {
    alerts.push({
      id: 'anamnesis-incomplete',
      ruleId: 'anamnesis_incomplete',
      severity: 'medium',
      category: 'history',
      title: 'La anamnesis esta incompleta',
      description: `La anamnesis se encuentra al ${snapshot.history.anamnesisCompletion}% de completitud.`,
      generatedAt,
      evidence: { completion: snapshot.history.anamnesisCompletion },
    })
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
    })
  }

  if (snapshot.results.pendingReviewCount > 0) {
    alerts.push({
      id: 'results-pending-review',
      ruleId: 'results_pending_review',
      severity: 'medium',
      category: 'results',
      title: 'Hay estudios pendientes de revision',
      description: `${snapshot.results.pendingReviewCount} resultado(s) todavia no fueron revisados.`,
      generatedAt,
      evidence: {
        latestResultId: snapshot.results.latest?.id ?? null,
        pendingReviewCount: snapshot.results.pendingReviewCount,
      },
    })
  }

  const recentSevereSymptom = snapshot.observations.recentSymptoms.find((item) => {
    const within72Hours = Date.now() - new Date(item.reportedAt).getTime() <= 72 * 60 * 60 * 1000
    return within72Hours && item.severity >= 8
  })

  if (recentSevereSymptom) {
    alerts.push({
      id: `symptom-severe-${recentSevereSymptom.id}`,
      ruleId: 'recent_severe_symptom',
      severity: 'critical',
      category: 'symptoms',
      title: 'Se detecto un sintoma severo reciente',
      description: `${recentSevereSymptom.name} fue reportado con severidad ${recentSevereSymptom.severity}.`,
      generatedAt,
      evidence: {
        symptomId: recentSevereSymptom.id,
        name: recentSevereSymptom.name,
        severity: recentSevereSymptom.severity,
        reportedAt: recentSevereSymptom.reportedAt,
      },
    })
  }

  const systolic = snapshot.observations.lastVitals?.systolic ?? null
  const diastolic = snapshot.observations.lastVitals?.diastolic ?? null
  if (systolic !== null && diastolic !== null && (systolic >= 140 || diastolic >= 90)) {
    alerts.push({
      id: 'vitals-blood-pressure-out-of-range',
      ruleId: 'blood_pressure_out_of_range',
      severity: systolic >= 180 || diastolic >= 120 ? 'critical' : 'high',
      category: 'vitals',
      title: 'La ultima presion arterial quedo fuera de rango',
      description: `Ultimo registro: ${systolic}/${diastolic}.`,
      generatedAt,
      evidence: {
        systolic,
        diastolic,
        measuredAt: snapshot.observations.lastVitals?.measuredAt ?? null,
      },
    })
  }

  if (snapshot.appointments.upcoming.length === 0 && alerts.some((item) => item.severity !== 'low')) {
    alerts.push({
      id: 'appointments-missing-follow-up',
      ruleId: 'missing_follow_up',
      severity: 'medium',
      category: 'appointments',
      title: 'No hay seguimiento agendado',
      description:
        'Existen senales clinicas que merecen seguimiento, pero no hay consultas futuras programadas.',
      generatedAt,
      evidence: {
        upcomingAppointments: 0,
        triggeringAlerts: alerts.filter((item) => item.severity !== 'low').map((item) => item.ruleId),
      },
    })
  }

  return alerts
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  )

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(',')}}`
}

export function buildAlertFingerprint(alert: PatientDeterministicAlert): string {
  const payload = stableStringify({
    ruleId: alert.ruleId,
    category: alert.category,
    severity: alert.severity,
    title: alert.title,
    description: alert.description,
    evidence: alert.evidence,
  })

  return createHash('sha256').update(payload).digest('hex')
}

export async function syncDeterministicAlerts(
  patientId: string,
  alerts: PatientDeterministicAlert[],
): Promise<void> {
  let admin: DerivedAlertClient
  try {
    admin = createAstroAdminClient() as unknown as DerivedAlertClient
  } catch (error) {
    logger.warn('[syncDeterministicAlerts] Admin client unavailable', error)
    return
  }

  const now = new Date().toISOString()
  const { data: existingRows, error: existingError } = await admin
    .from('patient_derived_alerts')
    .select(
      'id, fingerprint, status, first_detected_at, acknowledged_at, acknowledged_by_id, resolved_at',
    )
    .eq('patient_id', patientId)
    .eq('source_kind', 'rule_engine')
    .is('deleted_at', null)

  if (existingError) {
    throw existingError
  }

  const existingByFingerprint = new Map<string, DerivedAlertPublicRow>(
    (existingRows ?? []).map((row) => [row.fingerprint, row]),
  )

  const upserts: DerivedAlertInsertRow[] = alerts.map((alert) => {
    const fingerprint = buildAlertFingerprint(alert)
    const existing = existingByFingerprint.get(fingerprint)
    const status =
      existing?.status === 'dismissed'
        ? 'dismissed'
        : existing?.status === 'acknowledged'
          ? 'acknowledged'
          : 'open'

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
    }
  })

  if (upserts.length > 0) {
    const { error: upsertError } = await admin
      .from('patient_derived_alerts')
      .upsert(upserts, { onConflict: 'patient_id,source_kind,fingerprint' })

    if (upsertError) {
      throw upsertError
    }
  }

  const activeFingerprints = new Set(upserts.map((row) => row.fingerprint))
  const staleIds = (existingRows ?? [])
    .filter(
      (row) =>
        !activeFingerprints.has(row.fingerprint) &&
        (row.status === 'open' || row.status === 'acknowledged'),
    )
    .map((row) => row.id)

  if (staleIds.length > 0) {
    const { error: resolveError } = await admin
      .from('patient_derived_alerts')
      .update({
        status: 'resolved',
        resolved_at: now,
        updated_at: now,
      })
      .in('id', staleIds)

    if (resolveError) {
      throw resolveError
    }
  }
}

export async function listPersistedDerivedAlerts(
  patientId: string,
): Promise<DerivedAlertPublicRow[]> {
  let admin: DerivedAlertClient
  try {
    admin = createAstroAdminClient() as unknown as DerivedAlertClient
  } catch (error) {
    logger.warn('[listPersistedDerivedAlerts] Admin client unavailable', error)
    return []
  }

  const { data, error } = await admin
    .from('patient_derived_alerts')
    .select('*')
    .eq('patient_id', patientId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })

  if (error) {
    logger.warn('[listPersistedDerivedAlerts] Unable to load persisted alerts', error)
    return []
  }

  return data ?? []
}
