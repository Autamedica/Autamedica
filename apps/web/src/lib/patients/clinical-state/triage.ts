import type { ClinicalCaseState, CanonicalField, CurrentMedicationEntry } from './types'

/**
 * Clinical Triage Engine
 * 
 * Rules for clinical resolution, urgency escalation, and safety mandates.
 * Based on NHS, WHO, and NICE guidelines.
 */

export interface TriageResult {
  priority: 'routine' | 'priority' | 'urgent'
  reasons: string[]
  mandate: string
  suggestedAction: string
  references: string[]
}

const ADHD_STIMULANTS = ['metilfenidato', 'lisdexanfetamina', 'estimulante', 'ritalin', 'concerta', 'venvanse']

export function computeTriage(state: ClinicalCaseState): TriageResult {
  const reasons: string[] = []
  const references: string[] = ['WHO Standard Operating Protocol for Medication Reconciliation']
  let priority: 'routine' | 'priority' | 'urgent' = 'routine'
  let mandate = ''
  let suggestedAction = ''

  const ads = state.medications.currentMedications.value as CurrentMedicationEntry[] || []
  const hasStimulant = ads.some(med => 
    ADHD_STIMULANTS.some(s => med.medicationName.value?.toLowerCase().includes(s))
  )
  
  const hasSafetyAlert = state.symptoms.chestPain.value || 
                         state.symptoms.panicEpisodes.value || 
                         state.symptoms.selfHarmIdeation.value

  const hasUncertainty = ads.some(med => 
    !med.prescriberKnown.value || 
    med.doseMgPerDay.value === null || 
    (med.doseMgPerDay.value && med.doseMgPerDay.value >= 100)
  )

  // 1. RULE: ADHD Stimulant + Interruption Risk
  if (hasStimulant) {
    references.push('NHS guideline: Methylphenidate withdrawal risks')
    references.push('NICE ADHD Guideline (NG87)')
    
    if (hasUncertainty) {
      priority = 'priority'
      reasons.push('Continuidad de estimulantes con incertidumbre en esquema o prescriptor')
      mandate = 'RESOLUCIÓN CLÍNICA EL MISMO DÍA'
      suggestedAction = 'Evaluación para puente terapéutico supervisado. No permitir espera pasiva.'
    } else {
      reasons.push('Seguimiento de tratamiento crónico con estimulantes')
    }
  }

  // 2. RULE: Safety Critical Alerts
  if (hasSafetyAlert) {
    priority = 'urgent'
    reasons.push('Presencia de marcadores de alarma cardio-psiquiátrica')
    mandate = 'EVALUACIÓN MÉDICA URGENTE'
    suggestedAction = 'Pospone escalada de dosis. Valorar derivación a guardia o consulta prioritaria.'
  }

  // 3. RULE: Insomnia / High Impact
  if (state.symptoms.insomnia.value && hasStimulant) {
    priority = 'priority'
    reasons.push('Insomnio severo en paciente con estimulantes')
    suggestedAction = 'Aclaración clínica dirigida hoy para descartar efecto rebote.'
  }

  // Adjust suggested action and mandate based on NICE/NHS discontinuation risk
  if (hasStimulant && priority !== 'routine') {
    mandate = mandate || 'ALERTA DE CONTINUIDAD'
    suggestedAction = `IMPORTANTE: Prohibido el abandono terapéutico pasivo por riesgo de depresión reactiva (NHS). ${suggestedAction}`
  }

  return {
    priority,
    reasons,
    mandate,
    suggestedAction,
    references,
  }
}
