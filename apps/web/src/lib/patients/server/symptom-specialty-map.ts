/**
 * Symptom → Specialty + Red-Flag → Urgency mapping.
 *
 * Conservative triage: maps chief complaint codes from AI extraction
 * to recommended medical specialties, and red flag codes to urgency levels.
 * Designed to route patients to the right specialist — not to replace
 * clinical judgment.
 */

import type { ChiefComplaintCode, RedFlagCode } from '@/lib/patients/types/anamnesis-extraction'

export type TriageUrgency = 'critical' | 'high' | 'medium'

export interface SpecialtyRecommendation {
  specialties: string[]
  defaultUrgency: TriageUrgency
}

/**
 * Maps each chief complaint code to one or more specialties (ordered by relevance)
 * and a default urgency level (absent red flags).
 *
 * Specialty strings match the `doctors.specialty` column values in DB.
 */
const COMPLAINT_SPECIALTY_MAP: Record<ChiefComplaintCode, SpecialtyRecommendation> = {
  headache: {
    specialties: ['neurología', 'clínica médica'],
    defaultUrgency: 'medium',
  },
  chest_pain: {
    specialties: ['cardiología', 'clínica médica'],
    defaultUrgency: 'high',
  },
  cervical_pressure: {
    specialties: ['cardiología', 'clínica médica'],
    defaultUrgency: 'medium',
  },
  dyspnea: {
    specialties: ['neumonología', 'clínica médica'],
    defaultUrgency: 'high',
  },
  cough: {
    specialties: ['neumonología', 'clínica médica'],
    defaultUrgency: 'medium',
  },
  abdominal_pain: {
    specialties: ['gastroenterología', 'clínica médica'],
    defaultUrgency: 'medium',
  },
  digestive_symptoms: {
    specialties: ['gastroenterología', 'clínica médica'],
    defaultUrgency: 'medium',
  },
  genitourinary_symptoms: {
    specialties: ['urología', 'clínica médica'],
    defaultUrgency: 'medium',
  },
  palpitations: {
    specialties: ['cardiología', 'clínica médica'],
    defaultUrgency: 'medium',
  },
  fatigue: {
    specialties: ['clínica médica'],
    defaultUrgency: 'medium',
  },
  fever: {
    specialties: ['clínica médica'],
    defaultUrgency: 'medium',
  },
  dizziness: {
    specialties: ['neurología', 'clínica médica'],
    defaultUrgency: 'medium',
  },
  back_pain: {
    specialties: ['traumatología', 'clínica médica'],
    defaultUrgency: 'medium',
  },
  other: {
    specialties: ['clínica médica'],
    defaultUrgency: 'medium',
  },
}

/**
 * Red flag urgency overrides.
 * Any red flag present elevates the triage urgency above the complaint default.
 */
const RED_FLAG_URGENCY: Record<RedFlagCode, TriageUrgency> = {
  neurologic_deficit: 'critical',
  syncope: 'critical',
  chest_pain_exertional: 'critical',
  dyspnea_at_rest: 'critical',
  hemoptysis: 'critical',
  gastrointestinal_bleeding: 'critical',
  weight_loss: 'high',
  persistent_vomiting: 'high',
  hematuria: 'high',
  severe_progressive_pain: 'high',
  fever_persistent: 'high',
  other: 'medium',
}

const URGENCY_ORDER: Record<TriageUrgency, number> = {
  critical: 3,
  high: 2,
  medium: 1,
}

function maxUrgency(a: TriageUrgency, b: TriageUrgency): TriageUrgency {
  return URGENCY_ORDER[a] >= URGENCY_ORDER[b] ? a : b
}

export interface TriageResult {
  specialties: string[]
  urgency: TriageUrgency
  urgencyLabel: string
}

const URGENCY_LABELS: Record<TriageUrgency, string> = {
  critical: 'Urgente — consulta lo antes posible',
  high: 'Prioritario — agendar pronto',
  medium: 'Programable — agendar cuando puedas',
}

/**
 * Resolve triage recommendation from extraction codes.
 * Returns recommended specialties and computed urgency.
 */
export function resolveTriageFromExtraction(
  chiefComplaintCode: ChiefComplaintCode | null,
  redFlagCodes: RedFlagCode[],
): TriageResult {
  const complaint = chiefComplaintCode ?? 'other'
  const recommendation = COMPLAINT_SPECIALTY_MAP[complaint]

  let urgency = recommendation.defaultUrgency
  for (const flag of redFlagCodes) {
    const flagUrgency = RED_FLAG_URGENCY[flag]
    urgency = maxUrgency(urgency, flagUrgency)
  }

  return {
    specialties: recommendation.specialties,
    urgency,
    urgencyLabel: URGENCY_LABELS[urgency],
  }
}

/**
 * Spanish display name for a specialty code.
 */
const SPECIALTY_DISPLAY: Record<string, string> = {
  'neurología': 'Neurología',
  'cardiología': 'Cardiología',
  'clínica médica': 'Clínica Médica',
  'neumonología': 'Neumonología',
  'gastroenterología': 'Gastroenterología',
  'urología': 'Urología',
  'traumatología': 'Traumatología',
}

export function getSpecialtyDisplayName(specialty: string): string {
  return SPECIALTY_DISPLAY[specialty.toLowerCase()] ?? specialty
}
