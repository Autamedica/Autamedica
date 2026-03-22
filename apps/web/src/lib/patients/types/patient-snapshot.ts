import type {
  DashboardAppointmentSummary,
  DashboardMedicationSummary,
  DashboardResultSummary,
  DashboardScreeningSummary,
  DashboardSummary,
} from './dashboard-summary'

export interface PatientSnapshotCondition {
  id: string
  name: string
  recordedAt: string | null
  icd10Code: string | null
}

export interface PatientSnapshotSymptom {
  id: string
  name: string
  severity: number
  reportedAt: string
}

export interface PatientSnapshotMedicationLog {
  id: string
  medicationName: string
  dosage: string
  status: string
  takenAt: string
}

export interface PatientSnapshotVitals {
  measuredAt: string
  bloodPressure: string | null
  systolic: number | null
  diastolic: number | null
  heartRate: number | null
  temperature: number | null
  oxygenSaturation: number | null
  weight: number | null
}

export interface PatientSnapshot {
  version: 'patient_snapshot_v1'
  generatedAt: string
  patientId: string
  profile: {
    birthDate: string | null
    age: number | null
    gender: string | null
  }
  history: {
    activeConditions: PatientSnapshotCondition[]
    activeMedications: DashboardMedicationSummary[]
    allergies: string[]
    anamnesisCompletion: number | null
    lastEncounterDate: string | null
  }
  appointments: {
    next: DashboardAppointmentSummary | null
    upcoming: DashboardAppointmentSummary[]
    todayCount: number
  }
  results: {
    latest: DashboardResultSummary | null
    recent: DashboardResultSummary[]
    pendingReviewCount: number
  }
  prevention: {
    total: number
    items: DashboardScreeningSummary[]
    overdue: DashboardScreeningSummary[]
    dueSoon: DashboardScreeningSummary[]
    upToDate: DashboardScreeningSummary[]
  }
  observations: {
    recentSymptoms: PatientSnapshotSymptom[]
    lastVitals: PatientSnapshotVitals | null
    recentMedicationLogs: PatientSnapshotMedicationLog[]
  }
  sourceCounts: {
    appointments: number
    medicalRecords: number
    labResults: number
    screenings: number
    symptoms: number
    medicationLogs: number
    vitalSigns: number
  }
  missingSections: string[]
}

export type PatientAlertSeverity = 'critical' | 'high' | 'medium' | 'low'
export type PatientAlertCategory =
  | 'appointments'
  | 'history'
  | 'prevention'
  | 'results'
  | 'symptoms'
  | 'vitals'
  | 'profile'

export interface PatientDeterministicAlert {
  id: string
  ruleId: string
  severity: PatientAlertSeverity
  category: PatientAlertCategory
  title: string
  description: string
  generatedAt: string
  evidence: Record<string, unknown>
}

export interface PatientInsightsPayload {
  snapshot: PatientSnapshot
  alerts: PatientDeterministicAlert[]
  summary: DashboardSummary
}

export interface PatientAiAnalysisRequest {
  version: 'patient_ai_analysis_request_v1'
  generatedAt: string
  snapshot: PatientSnapshot
  alerts: PatientDeterministicAlert[]
  instructions: {
    objective: string
    rules: string[]
    outputSchema: {
      overview: string
      riskSignals: Array<{
        severity: 'low' | 'medium' | 'high' | 'critical'
        title: string
        rationale: string
      }>
      recommendedActions: Array<{
        priority: 'low' | 'medium' | 'high' | 'critical'
        action: string
        reason: string
      }>
      patientFacingSummary: string
    }
  }
}

export interface PatientInsightsResponse {
  success: boolean
  data?: PatientInsightsPayload
  error?: string
}

export interface PatientAiRiskSignal {
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  rationale: string
}

export interface PatientAiRecommendedAction {
  priority: 'low' | 'medium' | 'high' | 'critical'
  action: string
  reason: string
}

export interface PatientAiInsightResult {
  overview: string
  riskSignals: PatientAiRiskSignal[]
  recommendedActions: PatientAiRecommendedAction[]
  patientFacingSummary: string
}

export interface PatientAiInsightRecord {
  id: string
  patientId: string
  providerName: string
  modelName: string
  promptVersion: string
  snapshotVersion: string
  status: 'generated' | 'failed' | 'abstained'
  createdAt: string
  result: PatientAiInsightResult | null
  errorMessage: string | null
}
