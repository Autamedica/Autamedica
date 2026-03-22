import type { Json } from '@autamedica/types'
import type { BodyMapSelection } from './anamnesis'

export interface StructuredAnamnesisSection {
  title: string
  items: string[]
}

export interface StructuredAnamnesisSummary {
  headline: string
  narrative: string[]
  sections: StructuredAnamnesisSection[]
  completedSections: number
  lastUpdatedAt: string | null
}

export interface AnamnesisSectionRecord {
  section: string
  data: Json
  completed?: boolean | null
  updated_at?: string | null
}

export type OccupationCategory =
  | 'student'
  | 'administrative'
  | 'manual_labor'
  | 'healthcare'
  | 'education'
  | 'technology'
  | 'commerce_service'
  | 'unemployed'
  | 'retired'
  | 'homemaker'
  | 'other'

export type ChiefComplaintCode =
  | 'headache'
  | 'chest_pain'
  | 'cervical_pressure'
  | 'dyspnea'
  | 'cough'
  | 'abdominal_pain'
  | 'digestive_symptoms'
  | 'genitourinary_symptoms'
  | 'palpitations'
  | 'fatigue'
  | 'fever'
  | 'dizziness'
  | 'back_pain'
  | 'other'

export type MedicationFamilyCode =
  | 'analgesic_antipyretic'
  | 'nsaid'
  | 'ppi'
  | 'antibiotic_beta_lactam'
  | 'antibiotic_other'
  | 'antihypertensive_ace'
  | 'antihypertensive_arb'
  | 'beta_blocker'
  | 'diuretic'
  | 'antidiabetic_oral'
  | 'insulin'
  | 'bronchodilator'
  | 'corticosteroid'
  | 'antihistamine'
  | 'anxiolytic'
  | 'antidepressant'
  | 'anticonvulsant'
  | 'hormonal_contraceptive'
  | 'thyroid_hormone'
  | 'other'

export type AllergyGroupCode =
  | 'beta_lactam'
  | 'nsaid'
  | 'contrast_media'
  | 'food_seafood'
  | 'food_nuts'
  | 'food_dairy'
  | 'latex'
  | 'pollen'
  | 'dust_mites'
  | 'insect_sting'
  | 'other'

export type FamilyDeathCauseCode =
  | 'alive'
  | 'myocardial_infarction'
  | 'stroke'
  | 'cancer'
  | 'respiratory_failure'
  | 'infection'
  | 'accident_trauma'
  | 'suicide'
  | 'unknown'
  | 'other'

export type ChestPainPhenotypeCode =
  | 'oppressive'
  | 'stabbing'
  | 'burning'
  | 'pleuritic'
  | 'tearing'
  | 'tightness'
  | 'nonspecific'

export type CoughPhenotypeCode =
  | 'dry'
  | 'productive_clear'
  | 'productive_purulent'
  | 'bloody'
  | 'nocturnal'
  | 'paroxysmal'
  | 'nonspecific'

export type RedFlagCode =
  | 'neurologic_deficit'
  | 'syncope'
  | 'chest_pain_exertional'
  | 'dyspnea_at_rest'
  | 'hemoptysis'
  | 'gastrointestinal_bleeding'
  | 'weight_loss'
  | 'persistent_vomiting'
  | 'hematuria'
  | 'severe_progressive_pain'
  | 'fever_persistent'
  | 'other'

export interface NormalizedOpenFields {
  ageMonths: number | null
  occupationCategory: OccupationCategory | null
  occupationYears: number | null
  chiefComplaintCode: ChiefComplaintCode | null
  medicationFamilies: MedicationFamilyCode[]
  allergyGroups: AllergyGroupCode[]
  fatherDeathCause: FamilyDeathCauseCode | null
  motherDeathCause: FamilyDeathCauseCode | null
  chestPainPhenotype: ChestPainPhenotypeCode | null
  coughPhenotype: CoughPhenotypeCode | null
  redFlagCodes: RedFlagCode[]
}

export interface AnamnesisExtractionRequest {
  version: 'anamnesis_extraction_v2'
  purpose: 'extract_structured_anamnesis_without_diagnosis'
  patient: {
    patientId: string
    patientLabel: string
    anamnesisStatus: string
    privacyAccepted: boolean
  }
  guardrails: string[]
  deterministicSummary: StructuredAnamnesisSummary
  sourceSections: AnamnesisSectionRecord[]
  bodySelections: BodyMapSelection[]
  clarificationTurns?: AnamnesisClarificationTurn[]
}

export interface AnamnesisExtractionAlert {
  severity: 'low' | 'medium' | 'high'
  code: string
  message: string
  sourceSections: string[]
}

export interface AnamnesisExtractionCoverage {
  adequatelyCovered: string[]
  weakOrMissing: string[]
}

export interface AnamnesisExtractionIntegrity {
  contradictions: string[]
  possibleMiscalicks: string[]
  duplicatedNarratives: string[]
  missingCriticalData: string[]
}

export interface AnamnesisExtractionQuestion {
  priority: 'critical' | 'high' | 'medium'
  targetSection:
    | 'motivo_consulta'
    | 'enfermedad_actual'
    | 'antecedentes_personales'
    | 'antecedentes_familiares'
    | 'revision_sistemas'
    | 'integridad'
  questionType: 'open' | 'closed' | 'clarification'
  question: string
  rationale: string
}

export interface AnamnesisClarificationTurn extends AnamnesisExtractionQuestion {
  answer: string
  answeredAt: string
}

export interface AnamnesisExtractionResult {
  normalizedOpenFields: NormalizedOpenFields
  chiefComplaint: {
    rawText: string | null
    normalizedMedicalText: string | null
    sourceSections: string[]
    contextualMismatch: boolean
  }
  presentIllness: {
    chronology: string | null
    severity: string | null
    clinicalNarrative: string
    associatedSymptoms: string[]
    aggravatingFactors: string[]
    relievingFactors: string[]
    treatmentsTried: string[]
    missingData: string[]
  }
  personalHistory: {
    physiological: string[]
    pathological: string[]
    lifestyleAndContext: string[]
  }
  familyHistory: string[]
  reviewOfSystems: {
    cardiovascular: string[]
    respiratory: string[]
    digestive: string[]
    genitourinary: string[]
  }
  qualityAlerts: AnamnesisExtractionAlert[]
  argenteCoverage: AnamnesisExtractionCoverage
  dataIntegrity: AnamnesisExtractionIntegrity
  clinicianQuestions: string[]
  nextQuestions: AnamnesisExtractionQuestion[]
  safetyFlags: string[]
}
