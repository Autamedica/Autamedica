import type { ClinicalCaseState, CurrentMedicationEntry, ClinicalVertical, CaseIntent } from './types'

/**
 * Clinical Triage Engine
 * 
 * Rules for clinical resolution, urgency escalation, and safety mandates.
 * Based on NHS, WHO, and NICE guidelines.
 */

export interface TriageResult {
  priority: 'routine' | 'priority' | 'urgent'
  priorityRank: number
  vertical: ClinicalVertical
  intent: CaseIntent
  reasons: string[]
  mandate: string
  suggestedAction: string
  references: string[]
  
  // Operational fields for dashboard/backend
  status: 'pending' | 'acknowledged' | 'in_progress' | 'resolved' | 'escalated'
  riskOfInterruption: 'low' | 'medium' | 'high'
  requiresSameDayAction: boolean
  resolutionDeadline: string | null

  // Materialized Snapshots
  medicationSnapshot?: {
    name: string
    dose: string
    daysRemaining: number | null
  }
  symptomsSnapshot?: {
    insomniaSeverity?: number | null
    insomniaImpact?: string | null
  }
}

const ADHD_STIMULANTS = ['metilfenidato', 'lisdexanfetamina', 'estimulante', 'ritalin', 'concerta', 'venvanse']

export function computeTriage(state: ClinicalCaseState): TriageResult {
  const reasons: string[] = []
  const references: string[] = ['WHO Standard Operating Protocol for Medication Reconciliation']
  
  // Base taxonomy from state or inference
  let vertical: ClinicalVertical = state.workflow.vertical || 'psychiatry_general'
  let intent: CaseIntent = state.workflow.intent || 'evaluation'
  
  let priority: 'routine' | 'priority' | 'urgent' = 'routine'
  let priorityRank = 3
  let riskOfInterruption: 'low' | 'medium' | 'high' = 'low'
  let requiresSameDayAction = false
  let mandate = ''
  let suggestedAction = ''

  const ads = (state.medications?.currentMedications?.value as CurrentMedicationEntry[] | null) ?? []
  
  // Capture snapshot from first med if available
  const firstMed = ads[0]
  const medicationSnapshot = firstMed ? {
    name: firstMed.medicationName.value || 'Desconocido',
    dose: firstMed.doseMgPerDay.value ? `${firstMed.doseMgPerDay.value} mg/día` : 'Dosis no especificada',
    daysRemaining: firstMed.daysRemaining?.value ?? null
  } : undefined

  // 1. INFERENCE: Determine Vertical if not set
  const hasStimulant = ads.some(med => 
    ADHD_STIMULANTS.some(s => med.medicationName.value?.toLowerCase().includes(s))
  )
  if (hasStimulant && vertical === 'psychiatry_general') {
    vertical = 'tdah_continuity'
  }

  // 2. RULES: TDAH & CONTINUITY
  if (vertical === 'tdah_continuity' || hasStimulant) {
    references.push('NHS guideline: Methylphenidate withdrawal risks')
    references.push('NICE ADHD Guideline (NG87)')
    
    const minDaysRemaining = ads.reduce((min, med) => {
      const days = med.daysRemaining?.value
      if (days === null || days === undefined) return Math.min(min, 0)
      return days < min ? days : min
    }, Infinity)

    if (minDaysRemaining <= 1) {
      riskOfInterruption = 'high'
      requiresSameDayAction = true
    } else if (minDaysRemaining <= 3) {
      riskOfInterruption = 'medium'
    }

    const hasUncertainty = ads.some(med => 
      !med.prescriberKnown.value || 
      med.doseMgPerDay.value === null || 
      (med.doseMgPerDay.value && med.doseMgPerDay.value >= 100)
    )

    if (hasUncertainty || riskOfInterruption === 'high') {
      priority = 'priority'
      priorityRank = 2
      reasons.push('Continuidad de estimulantes con riesgo de interrupción o incertidumbre técnica')
      mandate = 'RESOLVER CONTINUIDAD TERAPÉUTICA'
      suggestedAction = 'Resolver continuidad y reconciliación farmacológica hoy. No permitir espera pasiva.'
    } else {
      reasons.push('Seguimiento de tratamiento crónico con estimulantes')
    }
  }

  // 3. RULES: INSOMNIA MANAGEMENT v1
  if (vertical === 'insomnia_management') {
     const severity = state.symptoms.nightsPerWeek?.value || 0
     const impact = state.symptoms.daytimeImpact?.value
     const chronic = severity >= 3
     
     if (state.symptoms.insomnia.value) {
        if (impact === 'severe' || (chronic && impact === 'moderate')) {
          priority = 'priority'
          priorityRank = 2
          reasons.push('Insomnio crónico con impacto funcional severo')
          mandate = 'EVALUACIÓN DE PAUTA Y RED FLAGS'
          suggestedAction = 'Evaluar pauta actual, higiene del sueño y necesidad de ajuste terapéutico.'
        } else {
          reasons.push('Gestión de insomnio incidental/moderado')
        }
     }

     // Functional Impact specific to Insomnia
     const hasHighRiskOccupational = impact === 'severe'
     if (hasHighRiskOccupational) {
        priority = 'priority'
        priorityRank = Math.min(priorityRank, 2)
        reasons.push('Deterioro funcional significativo por privación de sueño')
        mandate = 'REVISIÓN PRIORITARIA DE SEGURIDAD'
     }
  }

  // 4. CROSS-CUTTING RULES: Safety Critical Alerts (Always Urgent across all verticals)
  const hasSafetyAlert = state.symptoms.selfHarmIdeation.value || 
                         state.symptoms.chestPain.value || 
                         state.symptoms.panicEpisodes.value

  if (hasSafetyAlert) {
    priority = 'urgent'
    priorityRank = 1
    requiresSameDayAction = true
    reasons.push('Presencia de marcadores de alarma de seguridad (Autolesión o Cardio-Psiquiátrica)')
    mandate = 'EVALUACIÓN MÉDICA URGENTE'
    suggestedAction = 'CONTACTO INMEDIATO: El paciente reporta síntomas de seguridad o físicos de alarma.'
    references.push('NICE Clinical Guideline: Self-harm (CG133)')
  }

  // Adjust suggested action and mandate based on NICE/NHS discontinuation risk
  if (hasStimulant && priority !== 'routine') {
    mandate = mandate || 'ALERTA DE CONTINUIDAD'
    suggestedAction = `IMPORTANTE: Prohibido el abandono terapéutico pasivo por riesgo de depresión reactiva (NHS). ${suggestedAction}`
  }

  // Calculate resolution deadline (ISO, UTC)
  const deadlineDate = new Date()
  if (requiresSameDayAction) {
    deadlineDate.setUTCHours(23, 59, 59, 999)
  } else if (priority === 'priority') {
    deadlineDate.setUTCHours(deadlineDate.getUTCHours() + 24)
  } else {
    deadlineDate.setUTCHours(deadlineDate.getUTCHours() + 72)
  }

  return {
    priority,
    priorityRank,
    vertical,
    intent,
    reasons,
    mandate,
    suggestedAction,
    references,
    status: 'pending',
    riskOfInterruption,
    requiresSameDayAction,
    resolutionDeadline: deadlineDate.toISOString(),
    medicationSnapshot,
    symptomsSnapshot: {
      insomniaSeverity: state.symptoms.nightsPerWeek?.value ?? null,
      insomniaImpact: state.symptoms.daytimeImpact?.value ?? null
    }
  }
}
