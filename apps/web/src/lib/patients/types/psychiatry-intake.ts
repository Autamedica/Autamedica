import type { AnamnesisField, AnamnesisFieldValue, AnamnesisStep } from '@/lib/patients/types/anamnesis'

export type PsychiatryIntakePhase =
  | 'wizard_intake'
  | 'conversational_symptoms'
  | 'wizard_safety'
  | 'conversational_closure'
  | 'completed'

export type PsychiatryIntakeSection =
  | 'consulta_actual'
  | 'diagnostico_y_tratamiento'
  | 'contexto_personal'
  | 'historia_sintomas'
  | 'impacto_funcional'
  | 'respuesta_previa'
  | 'seguridad_clinica'
  | 'antecedentes_mentales'
  | 'contraindicaciones_medicas'
  | 'monitoreo_tratamiento'
  | 'objetivos_terapeuticos'
  | 'aclaraciones_finales'

export interface PsychiatryIntakeRecord {
  id: string
  patientId: string
  status: string
  completionPercentage: number
  lastPhase: PsychiatryIntakePhase
  createdAt: string
  updatedAt: string
  completedAt?: string | null
  locked?: boolean
  privacyAccepted?: boolean
  termsAccepted?: boolean
}

export interface PsychiatryIntakeSectionRecord {
  id: string
  intakeId: string
  section: PsychiatryIntakeSection
  phase: Exclude<PsychiatryIntakePhase, 'completed'>
  data: Record<string, unknown>
  completed: boolean
  completedAt?: string | null
  updatedAt: string
}

export interface PsychiatryIntakeProgress {
  completionPercentage: number
  completedSections: PsychiatryIntakeSection[]
  pendingSections: PsychiatryIntakeSection[]
  totalSections: number
}

export interface PsychiatryIntakeSnapshot {
  intake: PsychiatryIntakeRecord
  sections: PsychiatryIntakeSectionRecord[]
  progress: PsychiatryIntakeProgress
  patientBirthDate?: string | null
}

export interface PsychiatryIntakeStep extends Omit<AnamnesisStep, 'id'> {
  id: PsychiatryIntakeSection
  phase: Exclude<PsychiatryIntakePhase, 'completed'>
}

export interface PsychiatryConversationPrompt {
  id: PsychiatryIntakeSection
  phase: 'conversational_symptoms' | 'conversational_closure'
  title: string
  subtitle: string
  field: AnamnesisField
}

export type PsychiatryFormData = Record<string, Record<string, AnamnesisFieldValue>>
