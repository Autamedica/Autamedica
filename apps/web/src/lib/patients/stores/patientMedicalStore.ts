/**
 * Store médico específico para pacientes - Vista desde perspectiva del paciente
 * Implementado con Zustand para consistencia con el resto del proyecto.
 */
import { create } from 'zustand'
import { getClientEnvOrDefault, logger } from '@autamedica/shared'
import { createBrowserClient } from '@autamedica/auth'

interface PatientMedicalEntry {
  id: string
  type: 'symptom' | 'medication_taken' | 'vital_sign' | 'note' | 'appointment'
  content: string
  metadata?: {
    medication?: string
    dosage?: string
    takenAt?: string
    symptomSeverity?: 'leve' | 'moderado' | 'severo'
    vitals?: {
      weight?: number
      bloodPressure?: string
      heartRate?: number
      temperature?: number
    }
    appointmentType?: 'consulta' | 'control' | 'emergencia'
  }
  timestamp: string
  patientId: string
  isPrivate?: boolean
}

interface SymptomTrends {
  [severity: string]: number
}

interface MedicationAdherence {
  totalTaken: number
  adherenceScore: number
  lastTaken: string | null
}

type OverallStatus = 'excelente' | 'bueno' | 'regular' | 'necesita_atencion'

interface PatientMedicalState {
  entries: PatientMedicalEntry[]
  isLoading: boolean
  lastSync: string | null
  personalNotes: string[]
  symptoms: PatientMedicalEntry[]
  medications: PatientMedicalEntry[]
  vitals: PatientMedicalEntry[]
}

interface PatientMedicalActions {
  addPersonalNote: (content: string, patientId: string) => Promise<void>
  recordSymptom: (symptom: string, severity: 'leve' | 'moderado' | 'severo', patientId: string) => Promise<void>
  recordMedicationTaken: (medication: string, dosage: string, patientId: string) => Promise<void>
  recordVitalSigns: (vitals: { weight?: number; bloodPressure?: string; heartRate?: number; temperature?: number; oxygenSaturation?: number; glucoseLevel?: number }, patientId: string) => Promise<void>
  getSymptomTrends: () => SymptomTrends
  getMedicationAdherence: () => MedicationAdherence
  getHealthSummary: () => {
    symptomsCount: number
    lastSymptom: string
    medicationAdherence: number
    lastVitals: PatientMedicalEntry['metadata'] extends { vitals?: infer V } ? V : never
    overallStatus: OverallStatus
  }
  generateMedicalSummaryForDoctor: () => Promise<{
    summary: ReturnType<PatientMedicalActions['getHealthSummary']>
    recentEntries: PatientMedicalEntry[]
    trends: SymptomTrends
    medicationAdherence: MedicationAdherence
    generatedAt: string
  }>
  clearPrivateData: () => Promise<void>
}

function calculateSymptomTrends(symptoms: PatientMedicalEntry[]): SymptomTrends {
  return symptoms.slice(-7).reduce<SymptomTrends>((acc, symptom) => {
    const severity = symptom.metadata?.symptomSeverity || 'leve'
    acc[severity] = (acc[severity] || 0) + 1
    return acc
  }, {})
}

function calculateMedicationAdherence(medications: PatientMedicalEntry[]): MedicationAdherence {
  const today = new Date()
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
  const recentMeds = medications.slice(-30).filter(med =>
    new Date(med.timestamp) >= thirtyDaysAgo
  )

  return {
    totalTaken: recentMeds.length,
    adherenceScore: recentMeds.length > 0 ? Math.min(100, (recentMeds.length / 30) * 100) : 0,
    lastTaken: recentMeds[recentMeds.length - 1]?.timestamp || null
  }
}

function calculateOverallStatus(symptoms: PatientMedicalEntry[], medications: PatientMedicalEntry[]): OverallStatus {
  const trends = calculateSymptomTrends(symptoms)
  const severeSymptoms = trends['severo'] || 0
  const adherence = calculateMedicationAdherence(medications)

  if (severeSymptoms > 0) return 'necesita_atencion'
  if (adherence.adherenceScore < 50) return 'regular'
  if (adherence.adherenceScore > 80) return 'excelente'
  return 'bueno'
}

type ObservationType = 'vital_sign' | 'medication' | 'symptom'

async function submitObservation(
  set: (partial: Partial<PatientMedicalState>) => void,
  type: ObservationType,
  payload: Record<string, unknown>,
): Promise<{ source_record_id: string; alert_id: string | null } | null> {
  set({ isLoading: true })
  try {
    const supabase = createBrowserClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      logger.error('[Patient Medical Store] No active session for observation submit')
      set({ isLoading: false })
      return null
    }

    const supabaseUrl = getClientEnvOrDefault('PUBLIC_SUPABASE_URL', '')
    if (!supabaseUrl) {
      logger.error('[Patient Medical Store] Missing PUBLIC_SUPABASE_URL for observation submit')
      set({ isLoading: false })
      return null
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/ingest-patient-observation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ type, payload }),
    })

    const json = await res.json().catch(() => null) as Record<string, unknown> | null
    if (!res.ok || !json?.success) {
      const errorMsg = (json?.error as string) ?? `HTTP ${res.status}`
      logger.error(`[Patient Medical Store] Observation submit failed: ${errorMsg}`)
      set({ isLoading: false })
      return null
    }

    const data = json.data as { source_record_id: string; alert_id: string | null }
    set({ lastSync: new Date().toISOString(), isLoading: false })
    return data
  } catch (error) {
    logger.error('[Patient Medical Store] Observation submit error:', error)
    set({ isLoading: false })
    return null
  }
}

export const usePatientMedicalStore = create<PatientMedicalState & PatientMedicalActions>()((set, get) => ({
  entries: [],
  isLoading: false,
  lastSync: null,
  personalNotes: [],
  symptoms: [],
  medications: [],
  vitals: [],

  async addPersonalNote(content: string, patientId: string) {
    const newEntry: PatientMedicalEntry = {
      id: crypto.randomUUID(),
      type: 'note',
      content,
      timestamp: new Date().toISOString(),
      patientId,
      isPrivate: true
    }

    // Notes are private/local — no backend sync needed
    set(state => ({
      entries: [...state.entries, newEntry],
      personalNotes: [...state.personalNotes, content],
      lastSync: new Date().toISOString()
    }))
  },

  async recordSymptom(symptom: string, severity: 'leve' | 'moderado' | 'severo', patientId: string) {
    const severityMap: Record<string, number> = { leve: 3, moderado: 6, severo: 9 }
    const newEntry: PatientMedicalEntry = {
      id: crypto.randomUUID(),
      type: 'symptom',
      content: symptom,
      metadata: { symptomSeverity: severity },
      timestamp: new Date().toISOString(),
      patientId
    }

    set(state => ({
      entries: [...state.entries, newEntry],
      symptoms: [...state.symptoms, newEntry],
    }))

    const result = await submitObservation(set, 'symptom', {
      symptom_name: symptom,
      severity: severityMap[severity] ?? 5,
      is_urgent: severity === 'severo',
      reported_at: newEntry.timestamp,
    })

    if (result) {
      set(state => ({
        entries: state.entries.map(e => e.id === newEntry.id ? { ...e, id: result.source_record_id } : e),
        symptoms: state.symptoms.map(e => e.id === newEntry.id ? { ...e, id: result.source_record_id } : e),
      }))
    }
  },

  async recordMedicationTaken(medication: string, dosage: string, patientId: string) {
    const nowIso = new Date().toISOString()
    const newEntry: PatientMedicalEntry = {
      id: crypto.randomUUID(),
      type: 'medication_taken',
      content: `Tomé ${medication}`,
      metadata: { medication, dosage, takenAt: nowIso },
      timestamp: nowIso,
      patientId
    }

    set(state => ({
      entries: [...state.entries, newEntry],
      medications: [...state.medications, newEntry],
    }))

    const result = await submitObservation(set, 'medication', {
      medication_name: medication,
      dosage,
      status: 'taken',
      taken_at: nowIso,
      source: 'patient_portal',
    })

    if (result) {
      set(state => ({
        entries: state.entries.map(e => e.id === newEntry.id ? { ...e, id: result.source_record_id } : e),
        medications: state.medications.map(e => e.id === newEntry.id ? { ...e, id: result.source_record_id } : e),
      }))
    }
  },

  async recordVitalSigns(vitals, patientId: string) {
    const nowIso = new Date().toISOString()
    const newEntry: PatientMedicalEntry = {
      id: crypto.randomUUID(),
      type: 'vital_sign',
      content: 'Signos vitales registrados',
      metadata: { vitals },
      timestamp: nowIso,
      patientId
    }

    // Optimistic update
    set(state => ({
      entries: [...state.entries, newEntry],
      vitals: [...state.vitals, newEntry],
    }))

    // Parse bloodPressure "120/80" → systolic/diastolic
    let systolic: number | undefined
    let diastolic: number | undefined
    if (vitals.bloodPressure) {
      const parts = vitals.bloodPressure.split('/')
      if (parts.length === 2) {
        systolic = Number(parts[0]) || undefined
        diastolic = Number(parts[1]) || undefined
      }
    }

    const result = await submitObservation(set, 'vital_sign', {
      type: systolic ? 'blood_pressure' : 'general',
      blood_pressure_systolic: systolic,
      blood_pressure_diastolic: diastolic,
      heart_rate: vitals.heartRate,
      temperature: vitals.temperature,
      oxygen_saturation: vitals.oxygenSaturation,
      weight: vitals.weight,
      measured_at: nowIso,
    })

    if (result) {
      // Replace optimistic ID with real DB ID
      set(state => ({
        entries: state.entries.map(e => e.id === newEntry.id ? { ...e, id: result.source_record_id } : e),
        vitals: state.vitals.map(e => e.id === newEntry.id ? { ...e, id: result.source_record_id } : e),
      }))
    }
  },

  getSymptomTrends() {
    return calculateSymptomTrends(get().symptoms)
  },

  getMedicationAdherence() {
    return calculateMedicationAdherence(get().medications)
  },

  getHealthSummary() {
    const state = get()
    const adherence = calculateMedicationAdherence(state.medications)
    const lastVital = state.vitals[state.vitals.length - 1]

    return {
      symptomsCount: state.symptoms.length,
      lastSymptom: state.symptoms[state.symptoms.length - 1]?.content || 'Ninguno',
      medicationAdherence: adherence.adherenceScore,
      lastVitals: lastVital?.metadata?.vitals || null,
      overallStatus: calculateOverallStatus(state.symptoms, state.medications)
    }
  },

  async generateMedicalSummaryForDoctor() {
    const state = get()
    const summary = get().getHealthSummary()

    return {
      summary,
      recentEntries: state.entries.slice(-10).filter(entry => !entry.isPrivate),
      trends: calculateSymptomTrends(state.symptoms),
      medicationAdherence: calculateMedicationAdherence(state.medications),
      generatedAt: new Date().toISOString()
    }
  },

  async clearPrivateData() {
    set(state => ({
      personalNotes: [],
      entries: state.entries.filter(entry => !entry.isPrivate)
    }))
  }
}))
