/**
 * Service frontend: Transforms raw extraction guidance into UI-friendly format.
 * Capa 3 — Funciones puras, sin estado, sin fetch.
 */

import type {
  NextQuestion,
  QualityAlert,
  ExtractionServiceResult,
} from './anamnesis-extraction.service'

export interface GuidanceQuestion {
  id: string
  text: string
  rationale: string
  inputType: 'text' | 'select'
  targetSection: string
  priority: 'critical' | 'high' | 'medium'
}

export interface ExtractionGuidance {
  questions: GuidanceQuestion[]
  alerts: string[]
  coverageSummary: string
  coverage: string[]
  gaps: string[]
  hasCritical: boolean
}

const MAX_QUESTIONS_PER_CHECKPOINT = 3

const SECTION_LABELS: Record<string, string> = {
  motivo_consulta: 'Motivo de consulta',
  enfermedad_actual: 'Enfermedad actual',
  antecedentes_personales: 'Antecedentes personales',
  antecedentes_familiares: 'Antecedentes familiares',
  revision_sistemas: 'Revisión por sistemas',
  integridad: 'Datos generales',
}

function questionToGuidance(q: NextQuestion, index: number): GuidanceQuestion {
  return {
    id: `q-${index}-${q.targetSection}`,
    text: q.question,
    rationale: q.rationale,
    inputType: q.questionType === 'closed' ? 'select' : 'text',
    targetSection: q.targetSection,
    priority: q.priority,
  }
}

function alertToMessage(alert: QualityAlert): string {
  if (alert.severity === 'high') {
    return `⚠️ ${alert.message}`
  }
  return alert.message
}

function buildCoverageSummary(
  adequate: string[],
  weak: string[],
): string {
  const total = adequate.length + weak.length
  if (total === 0) return ''

  const covered = adequate.length
  if (weak.length === 0) {
    return `Tu historia clínica cubre las ${covered} áreas principales. Excelente.`
  }

  const weakLabels = weak
    .map(s => SECTION_LABELS[s] ?? s)
    .join(', ')

  return `Tu historia cubre ${covered} de ${total} áreas. Faltan datos en: ${weakLabels}.`
}

/**
 * Transforms raw extraction result into UI-friendly guidance.
 * Filters by priority, limits to MAX_QUESTIONS_PER_CHECKPOINT, formats text.
 */
export function transformGuidance(
  result: ExtractionServiceResult,
): ExtractionGuidance {
  const { guidance } = result

  // Filter and sort: critical first, then high, then medium
  const priorityOrder = { critical: 0, high: 1, medium: 2 }
  const sorted = [...guidance.nextQuestions]
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

  // For partial checkpoint: all priorities (patient needs to see them)
  // Critical/high sort to top naturally via priorityOrder
  const filtered = sorted

  const questions = filtered
    .slice(0, MAX_QUESTIONS_PER_CHECKPOINT)
    .map(questionToGuidance)

  const alerts = guidance.qualityAlerts
    .filter(a => a.severity !== 'low')
    .map(alertToMessage)

  const coverageSummary = buildCoverageSummary(
    guidance.coverage.adequate,
    guidance.coverage.weak,
  )

  const adequateLabels = guidance.coverage.adequate.map(s => SECTION_LABELS[s] ?? s)
  const weakLabels = guidance.coverage.weak.map(s => SECTION_LABELS[s] ?? s)

  return {
    questions,
    alerts,
    coverageSummary,
    coverage: adequateLabels,
    gaps: weakLabels,
    hasCritical: result.hasCriticalQuestions,
  }
}

/**
 * Determines if guidance has actionable questions worth showing.
 */
export function hasActionableGuidance(guidance: ExtractionGuidance): boolean {
  return guidance.questions.length > 0 || guidance.coverage.length > 0 || guidance.gaps.length > 0
}
