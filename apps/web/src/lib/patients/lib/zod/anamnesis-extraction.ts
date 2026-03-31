import { z } from 'zod'

export const BodySymptomTypeEnum = z.enum([
  'pain',
  'pressure',
  'burning',
  'numbness',
  'weakness',
  'swelling',
  'other',
])

export const BodyLateralityEnum = z.enum([
  'left',
  'right',
  'bilateral',
  'midline',
  'unknown',
])

export const BodyAspectEnum = z.enum([
  'anterior',
  'posterior',
  'diffuse',
])

export const BodyMapSelectionSchema = z.object({
  partId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  intensity: z.number().int().min(1).max(10),
  symptomType: BodySymptomTypeEnum,
  laterality: BodyLateralityEnum,
  aspect: BodyAspectEnum,
})

export const BodyMapSelectionsSchema = z.array(BodyMapSelectionSchema).max(12)

export const OccupationCategoryEnum = z.enum([
  'student',
  'administrative',
  'manual_labor',
  'healthcare',
  'education',
  'technology',
  'commerce_service',
  'unemployed',
  'retired',
  'homemaker',
  'other',
])

export const ChiefComplaintCodeEnum = z.enum([
  'headache',
  'chest_pain',
  'cervical_pressure',
  'dyspnea',
  'cough',
  'abdominal_pain',
  'digestive_symptoms',
  'genitourinary_symptoms',
  'palpitations',
  'fatigue',
  'fever',
  'dizziness',
  'back_pain',
  'other',
])

export const MedicationFamilyCodeEnum = z.enum([
  'analgesic_antipyretic',
  'nsaid',
  'ppi',
  'antibiotic_beta_lactam',
  'antibiotic_other',
  'antihypertensive_ace',
  'antihypertensive_arb',
  'beta_blocker',
  'diuretic',
  'antidiabetic_oral',
  'insulin',
  'bronchodilator',
  'corticosteroid',
  'antihistamine',
  'anxiolytic',
  'antidepressant',
  'anticonvulsant',
  'hormonal_contraceptive',
  'thyroid_hormone',
  'other',
])

export const AllergyGroupCodeEnum = z.enum([
  'beta_lactam',
  'nsaid',
  'contrast_media',
  'food_seafood',
  'food_nuts',
  'food_dairy',
  'latex',
  'pollen',
  'dust_mites',
  'insect_sting',
  'other',
])

export const FamilyDeathCauseCodeEnum = z.enum([
  'alive',
  'myocardial_infarction',
  'stroke',
  'cancer',
  'respiratory_failure',
  'infection',
  'accident_trauma',
  'suicide',
  'unknown',
  'other',
])

export const ChestPainPhenotypeCodeEnum = z.enum([
  'oppressive',
  'stabbing',
  'burning',
  'pleuritic',
  'tearing',
  'tightness',
  'nonspecific',
])

export const CoughPhenotypeCodeEnum = z.enum([
  'dry',
  'productive_clear',
  'productive_purulent',
  'bloody',
  'nocturnal',
  'paroxysmal',
  'nonspecific',
])

export const RedFlagCodeEnum = z.enum([
  'neurologic_deficit',
  'syncope',
  'chest_pain_exertional',
  'dyspnea_at_rest',
  'hemoptysis',
  'gastrointestinal_bleeding',
  'weight_loss',
  'persistent_vomiting',
  'hematuria',
  'severe_progressive_pain',
  'fever_persistent',
  'other',
])

export const NormalizedOpenFieldsSchema = z.object({
  ageMonths: z.number().int().min(0).max(1200).nullable(),
  occupationCategory: OccupationCategoryEnum.nullable(),
  occupationYears: z.number().int().min(0).max(50).nullable(),
  chiefComplaintCode: ChiefComplaintCodeEnum.nullable(),
  medicationFamilies: z.array(MedicationFamilyCodeEnum).max(3),
  allergyGroups: z.array(AllergyGroupCodeEnum).max(2),
  fatherDeathCause: FamilyDeathCauseCodeEnum.nullable(),
  motherDeathCause: FamilyDeathCauseCodeEnum.nullable(),
  chestPainPhenotype: ChestPainPhenotypeCodeEnum.nullable(),
  coughPhenotype: CoughPhenotypeCodeEnum.nullable(),
  redFlagCodes: z.array(RedFlagCodeEnum).max(5),
})

export const AnamnesisExtractionAlertSchema = z.object({
  severity: z.enum(['low', 'medium', 'high']),
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
  sourceSections: z.array(z.string().trim().min(1)),
})

export const AnamnesisExtractionCoverageSchema = z.object({
  adequatelyCovered: z.array(z.string().trim().min(1)),
  weakOrMissing: z.array(z.string().trim().min(1)),
})

export const AnamnesisExtractionIntegritySchema = z.object({
  contradictions: z.array(z.string().trim().min(1)),
  possibleMiscalicks: z.array(z.string().trim().min(1)),
  duplicatedNarratives: z.array(z.string().trim().min(1)),
  missingCriticalData: z.array(z.string().trim().min(1)),
})

export const AnamnesisExtractionQuestionSchema = z.object({
  priority: z.enum(['critical', 'high', 'medium']),
  targetSection: z.enum([
    'motivo_consulta',
    'enfermedad_actual',
    'antecedentes_personales',
    'antecedentes_familiares',
    'revision_sistemas',
    'integridad',
  ]),
  questionType: z.enum(['open', 'closed', 'clarification']),
  question: z.string().trim().min(1),
  rationale: z.string().trim().min(1),
})

export const AnamnesisClarificationTurnSchema = AnamnesisExtractionQuestionSchema.extend({
  answer: z.string().trim().min(1),
  answeredAt: z.string().trim().min(1),
})

export const AnamnesisExtractionRunInputSchema = z.object({
  clarificationTurns: z.array(AnamnesisClarificationTurnSchema).max(24).optional(),
})

export const AnamnesisExtractionResultSchema = z.object({
  normalizedOpenFields: NormalizedOpenFieldsSchema,
  chiefComplaint: z.object({
    rawText: z.string().trim().min(1).nullable(),
    normalizedMedicalText: z.string().trim().min(1).nullable(),
    sourceSections: z.array(z.string().trim().min(1)),
    contextualMismatch: z.boolean(),
  }),
  presentIllness: z.object({
    chronology: z.string().trim().min(1).nullable(),
    severity: z.string().trim().min(1).nullable(),
    clinicalNarrative: z.string().trim().min(1),
    associatedSymptoms: z.array(z.string().trim().min(1)),
    aggravatingFactors: z.array(z.string().trim().min(1)),
    relievingFactors: z.array(z.string().trim().min(1)),
    treatmentsTried: z.array(z.string().trim().min(1)),
    missingData: z.array(z.string().trim().min(1)),
  }),
  personalHistory: z.object({
    physiological: z.array(z.string().trim().min(1)),
    pathological: z.array(z.string().trim().min(1)),
    lifestyleAndContext: z.array(z.string().trim().min(1)),
  }),
  familyHistory: z.array(z.string().trim().min(1)),
  reviewOfSystems: z.object({
    cardiovascular: z.array(z.string().trim().min(1)),
    respiratory: z.array(z.string().trim().min(1)),
    digestive: z.array(z.string().trim().min(1)),
    genitourinary: z.array(z.string().trim().min(1)),
  }),
  qualityAlerts: z.array(AnamnesisExtractionAlertSchema),
  argenteCoverage: AnamnesisExtractionCoverageSchema,
  dataIntegrity: AnamnesisExtractionIntegritySchema,
  clinicalCrossReferences: z.array(z.object({
    sourceSections: z.array(z.string().trim().min(1)),
    observation: z.string().trim().min(1),
    relevance: z.enum(['critical', 'high', 'medium']),
  })).default([]),
  clinicianQuestions: z.array(z.string().trim().min(1)),
  nextQuestions: z.array(AnamnesisExtractionQuestionSchema),
  safetyFlags: z.array(z.string().trim().min(1)),
})
