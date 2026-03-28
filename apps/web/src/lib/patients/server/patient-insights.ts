import { computeAgeFromIso } from '@/lib/patients/lib/demographics'
import type {
  DashboardScreeningSummary,
} from '@/lib/patients/types/dashboard-summary'
import type {
  PatientAiAnalysisRequest,
  PatientInsightsPayload,
  PatientSnapshot,
} from '@/lib/patients/types/patient-snapshot'
import { createAstroAdminClient } from '@/lib/supabase'
import { logger } from '@autamedica/shared'
import type { Database, Json } from '@autamedica/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildDeterministicAlerts } from './alert-engine'
import { buildMissingSections, buildDashboardSummary } from './dashboard-builder'
import {
  toObject,
  toStringArray,
  isPrescriptionActive,
  normalizeAppointment,
  normalizeMedication,
  normalizeScreening,
  normalizeRecommendedScreening,
  normalizeResult,
  normalizeVitals,
} from './normalize'
import type {
  AppointmentRow,
  LabResultRow,
  MedicalRecordRow,
  PatientScreeningRow,
  RecommendedScreeningRow,
  VitalSignRow,
} from './normalize'

export {
  buildDeterministicAlerts,
  syncDeterministicAlerts,
  listPersistedDerivedAlerts,
} from './alert-engine'
export {
  buildMissingSections,
  buildPriorities,
  buildDashboardSummary,
} from './dashboard-builder'
export {
  toObject,
  toStringArray,
  isPrescriptionActive,
  formatDoctorName,
  normalizeAppointment,
  normalizeMedication,
  normalizeScreeningStatus,
  screeningStatusPriority,
  normalizeScreening,
  normalizeRecommendedScreening,
  normalizeResult,
  normalizeVitals,
} from './normalize'
export { stableStringify, buildAlertFingerprint } from './alert-engine'

// Union of createRouteHandlerClient / createAdminClient return types causes "not callable"
// due to @supabase/ssr vs @supabase/supabase-js generic arity mismatch.
// Both return a compatible SupabaseClient<Database> at runtime.
type InsightsSupabaseClient = SupabaseClient<Database>

type PatientRow = Database['public']['Tables']['patients']['Row']
type AnamnesisRow = Database['public']['Tables']['anamnesis']['Row']

interface RecommendedScreeningsRpcClient {
  rpc(
    _fn: 'get_recommended_screenings',
    _args: { patient_id_param: string; include_overdue: boolean },
  ): Promise<{
    data: RecommendedScreeningRow[] | null
    error: unknown
  }>
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
        'Analizar el estado clinico del paciente sin inventar datos y priorizar senales relevantes para seguimiento.',
      rules: [
        'Usa unicamente el snapshot y las alertas recibidas.',
        'No diagnostiques ni indiques tratamiento.',
        'Distingue hechos observados de inferencias.',
        'Si faltan datos criticos, declaralo explicitamente.',
        'No contradigas alertas deterministicas existentes.',
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
  }
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
  ])

  let recommendedScreeningsResult: {
    data: RecommendedScreeningRow[] | null
    error: unknown
  } = {
    data: null,
    error: null,
  }

  try {
    const admin = createAstroAdminClient()
    const recommendedScreeningsClient = admin as unknown as RecommendedScreeningsRpcClient
    recommendedScreeningsResult = await recommendedScreeningsClient.rpc(
      'get_recommended_screenings',
      {
        patient_id_param: patientId,
        include_overdue: true,
      },
    )
  } catch (error) {
    logger.warn(
      '[buildPatientInsights] Admin client unavailable for screening recommendations',
      error,
    )
  }

  if (patientResult.error) {
    logger.warn('[buildPatientInsights] Unable to load patient row', patientResult.error)
  }
  if (anamnesisResult.error) {
    logger.warn('[buildPatientInsights] Unable to load anamnesis summary', anamnesisResult.error)
  }
  if (appointmentsResult.error) {
    logger.warn('[buildPatientInsights] Unable to load appointments', appointmentsResult.error)
  }
  if (medicalRecordsResult.error) {
    logger.warn('[buildPatientInsights] Unable to load medical records', medicalRecordsResult.error)
  }
  if (patientScreeningsResult.error) {
    logger.warn('[buildPatientInsights] Unable to load patient screenings', patientScreeningsResult.error)
  }
  if (recommendedScreeningsResult.error) {
    logger.warn(
      '[buildPatientInsights] Unable to load screening recommendations',
      recommendedScreeningsResult.error,
    )
  }
  if (labResultsResult.error) {
    logger.warn('[buildPatientInsights] Unable to load lab results', labResultsResult.error)
  }
  if (symptomsResult.error) {
    logger.warn('[buildPatientInsights] Unable to load symptoms', symptomsResult.error)
  }
  if (medicationLogsResult.error) {
    logger.warn('[buildPatientInsights] Unable to load medication logs', medicationLogsResult.error)
  }
  if (vitalSignsResult.error) {
    logger.warn('[buildPatientInsights] Unable to load vital signs', vitalSignsResult.error)
  }

  const patient = patientResult.data as Pick<PatientRow, 'birth_date' | 'gender' | 'allergies'> | null
  const appointments = ((appointmentsResult.data ?? []) as unknown as AppointmentRow[]).map(normalizeAppointment)
  const medicalRecords = (medicalRecordsResult.data ?? []) as MedicalRecordRow[]
  const activeConditions = medicalRecords
    .filter((record) => record.type === 'diagnosis')
    .map((record) => {
      const content = toObject(record.content as Json | null)
      return {
        id: record.id,
        name: record.title,
        recordedAt: record.created_at,
        icd10Code: typeof content.icd10_code === 'string' ? content.icd10_code : null,
      }
    })
  const activeMedications = medicalRecords
    .filter((record) => record.type === 'prescription' && isPrescriptionActive(record))
    .map(normalizeMedication)

  const screeningsById = new Map<string, DashboardScreeningSummary>()
  for (const item of (patientScreeningsResult.data ?? []) as PatientScreeningRow[]) {
    screeningsById.set(item.screening_id, normalizeScreening(item))
  }
  for (const item of (recommendedScreeningsResult.data ?? []) as RecommendedScreeningRow[]) {
    if (!screeningsById.has(item.screening_id)) {
      screeningsById.set(item.screening_id, normalizeRecommendedScreening(item))
    }
  }

  const screeningWeight = { overdue: 0, due_soon: 1, up_to_date: 2 } as const
  const screenings = Array.from(screeningsById.values()).sort(
    (left, right) => screeningWeight[left.status] - screeningWeight[right.status],
  )
  const recentResults = ((labResultsResult.data ?? []) as LabResultRow[]).map(normalizeResult)
  const recentSymptoms = ((symptomsResult.data ?? []) as unknown[]).map((item) => {
    const row = item as Database['public']['Tables']['symptom_reports']['Row']
    return {
      id: row.id,
      name: row.symptom_name,
      severity: row.severity,
      reportedAt: row.reported_at,
    }
  })
  const recentMedicationLogs = ((medicationLogsResult.data ?? []) as unknown[]).map((item) => {
    const row = item as Database['public']['Tables']['medication_logs']['Row']
    return {
      id: row.id,
      medicationName: row.medication_name,
      dosage: row.dosage,
      status: row.status,
      takenAt: row.taken_at,
    }
  })
  const vitalSigns = (vitalSignsResult.data ?? []) as VitalSignRow[]
  const anamnesis = anamnesisResult.data as Pick<AnamnesisRow, 'completion_percentage'> | null

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
  }

  const snapshot: PatientSnapshot = {
    ...snapshotBase,
    missingSections: buildMissingSections(snapshotBase),
  }
  const alerts = buildDeterministicAlerts(snapshot)
  const summary = buildDashboardSummary(snapshot)

  return {
    snapshot,
    alerts,
    summary,
  }
}
