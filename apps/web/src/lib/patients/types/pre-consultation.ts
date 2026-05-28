import type { ClinicalCaseState } from '../clinical-state/types'
import type { AnamnesisExtractionResult } from './anamnesis-extraction'

export type PreconsultationStatus = 'in_progress' | 'completed' | 'abandoned'

export interface Preconsultation {
  id: string
  patientId: string
  appointmentId: string | null
  status: PreconsultationStatus
  clinicalState: ClinicalCaseState
  extractionSummary: AnamnesisExtractionResult | null
  audioLogUrls: string[]
  createdAt: string
  updatedAt: string
}

export interface PreconsultationTurnResponse {
  preconsultationId: string
  status: PreconsultationStatus
  extractedTranscript: string
  nextQuestion: string
  safetyAlert: string | null
}
