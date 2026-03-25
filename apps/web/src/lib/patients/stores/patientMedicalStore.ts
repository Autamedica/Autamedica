/**
 * Store médico específico para pacientes - Vista desde perspectiva del paciente
 * Implementado con Zustand para consistencia con el resto del proyecto.
 */
import { create } from 'zustand'
import { logger } from '@autamedica/shared'

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

async function syncWithBackend(set: (partial: Partial<PatientMedicalState>) => void) {
  set({ isLoading: true })
  try {
    await new Promise(resolve => setTimeout(resolve, 300))
    set({ lastSync: new Date().toISOString(), isLoading: false })
  } catch (error) {
    logger.error('[Patient Medical Store] Sync failed:', error)
    set({ isLoading: false })
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

    set(state => ({
      entries: [...state.entries, newEntry],
      personalNotes: [...state.personalNotes, content],
      lastSync: new Date().toISOString()
    }))

    await syncWithBackend(set)
  },

  async recordSymptom(symptom: string, severity: 'leve' | 'moderado' | 'severo', patientId: string) {
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
      lastSync: new Date().toISOString()
    }))

    await syncWithBackend(set)
  },

  async recordMedicationTaken(medication: string, dosage: string, patientId: string) {
    const newEntry: PatientMedicalEntry = {
      id: crypto.randomUUID(),
      type: 'medication_taken',
      content: `Tomé ${medication}`,
      metadata: { medication, dosage, takenAt: new Date().toISOString() },
      timestamp: new Date().toISOString(),
      patientId
    }

    set(state => ({
      entries: [...state.entries, newEntry],
      medications: [...state.medications, newEntry],
      lastSync: new Date().toISOString()
    }))

    await syncWithBackend(set)
  },

  async recordVitalSigns(vitals, patientId: string) {
    const newEntry: PatientMedicalEntry = {
      id: crypto.randomUUID(),
      type: 'vital_sign',
      content: 'Signos vitales registrados',
      metadata: { vitals },
      timestamp: new Date().toISOString(),
      patientId
    }

    set(state => ({
      entries: [...state.entries, newEntry],
      vitals: [...state.vitals, newEntry],
      lastSync: new Date().toISOString()
    }))

    await syncWithBackend(set)
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
