import type { ClinicalCaseState } from '../clinical-state/types'
import type { ISODateString, PatientId, UUID } from '@autamedica/types'

export type PreconsultationStatus = 'in_progress' | 'completed' | 'abandoned'

export interface PreconsultationSummary {
  clinicalNarrative: string
  safetyFlags: string[]
  redFlags: string[]
  clinicianQuestions: string[]
  requiresCertificate: boolean
  requiresPrescriptionRenewal: boolean
  administrativeNotes?: string
}

export interface Preconsultation {
  id: UUID
  patientId: PatientId
  appointmentId: UUID | null
  status: PreconsultationStatus
  clinicalState: ClinicalCaseState
  extractionSummary: PreconsultationSummary | null
  audioLogUrls: string[]
  createdAt: ISODateString
  updatedAt: ISODateString
}

export interface PreconsultationTurnResponse {
  preconsultationId: string
  status: PreconsultationStatus
  extractedTranscript: string
  nextQuestion: string
  safetyAlert: string | null
  summary?: PreconsultationSummary | null
}
