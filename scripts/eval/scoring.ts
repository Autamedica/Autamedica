/**
 * Funciones de scoring para evaluacion de extraccion de anamnesis.
 * Separadas del runner para poder testearlas unitariamente.
 */

import type { AnamnesisExtractionResult } from '../../apps/web/src/lib/patients/types/anamnesis-extraction'
import type { GoldStandardCase } from './anamnesis-gold-standard'

// ── Tipos ──

export interface FieldScore {
  field: string
  expected: unknown
  actual: unknown
  score: number
  /** exact | partial | missing | hallucinated | skipped */
  status: 'exact' | 'partial' | 'missing' | 'hallucinated' | 'skipped'
  weight: number
}

export interface CaseResult {
  caseId: string
  caseName: string
  tags: string[]
  fields: FieldScore[]
  narrativeScore: number
  overallScore: number
}

export interface EvalSummary {
  timestamp: string
  model: string
  promptVersion: string
  cases: CaseResult[]
  overall: number
  safetyFlagsRecall: number
  chiefComplaintAccuracy: number
  medicationFamiliesF1: number
}

// ── Utilidades de scoring ──

/** Jaccard similarity: |A inter B| / |A union B|. Devuelve 1.0 si ambos vacios. */
export function jaccardSimilarity(expected: string[], actual: string[]): number {
  const setA = new Set(expected)
  const setB = new Set(actual)
  if (setA.size === 0 && setB.size === 0) return 1.0
  const intersection = Array.from(setA).filter(x => setB.has(x)).length
  const union = new Set([...setA, ...setB]).size
  return intersection / union
}

/** Precision: cuantos de los actual estan en expected */
export function precision(expected: string[], actual: string[]): number {
  if (actual.length === 0) return expected.length === 0 ? 1.0 : 0.0 // si no hay nada y se esperaba nada, perfecto
  const setE = new Set(expected)
  const correct = actual.filter(x => setE.has(x)).length
  return correct / actual.length
}

/** Recall: cuantos de los expected fueron capturados */
export function recall(expected: string[], actual: string[]): number {
  if (expected.length === 0) return actual.length === 0 ? 1.0 : 0.0
  const setA = new Set(actual)
  const found = expected.filter(x => setA.has(x)).length
  return found / expected.length
}

/** F1 score */
export function f1Score(expected: string[], actual: string[]): number {
  const p = precision(expected, actual)
  const r = recall(expected, actual)
  if (p + r === 0) return 0
  return (2 * p * r) / (p + r)
}

/** Evalua si una narrativa contiene los terminos clave (case-insensitive, normalizado) */
export function narrativeKeyTermScore(narrative: string, keyTerms: string[]): number {
  if (keyTerms.length === 0) return 1.0
  const normalized = narrative.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  let found = 0
  for (const term of keyTerms) {
    const normalizedTerm = term.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (normalized.includes(normalizedTerm)) found++
  }
  return found / keyTerms.length
}

// ── Comparacion por campo ──

const FIELD_WEIGHTS: Record<string, number> = {
  'safetyFlags': 3,
  'redFlagCodes': 3,
  'chiefComplaintCode': 2,
  'chestPainPhenotype': 2,
  'medicationFamilies': 1.5,
  'allergyGroups': 1.5,
  'contextualMismatch': 1.5,
  // resto: 1
}

function getWeight(field: string): number {
  return FIELD_WEIGHTS[field] ?? 1
}

function scoreEnum(expected: unknown, actual: unknown, field: string): FieldScore {
  const w = getWeight(field)
  if (expected === undefined) return { field, expected, actual, score: 1, status: 'skipped', weight: 0 }
  if (expected === actual) return { field, expected, actual, score: 1, status: 'exact', weight: w }
  if (actual === null || actual === undefined) return { field, expected, actual, score: 0, status: 'missing', weight: w }
  return { field, expected, actual, score: 0, status: 'hallucinated', weight: w }
}

function scoreBoolean(expected: unknown, actual: unknown, field: string): FieldScore {
  const w = getWeight(field)
  if (expected === undefined) return { field, expected, actual, score: 1, status: 'skipped', weight: 0 }
  if (expected === actual) return { field, expected, actual, score: 1, status: 'exact', weight: w }
  return { field, expected, actual, score: 0, status: expected === null ? 'missing' : 'hallucinated', weight: w }
}

function scoreArray(expected: string[] | undefined, actual: string[] | undefined, field: string): FieldScore {
  const w = getWeight(field)
  if (expected === undefined) return { field, expected, actual, score: 1, status: 'skipped', weight: 0 }
  const e = expected ?? []
  const a = actual ?? []
  const sim = jaccardSimilarity(e, a)
  let status: FieldScore['status'] = 'exact'
  if (sim === 0 && e.length > 0) status = 'missing'
  else if (sim === 0 && a.length > 0) status = 'hallucinated'
  else if (sim < 1) status = 'partial'
  return { field, expected: e, actual: a, score: sim, status, weight: w }
}

function scoreNullableNumber(expected: unknown, actual: unknown, field: string, tolerance = 12): FieldScore {
  const w = getWeight(field)
  if (expected === undefined) return { field, expected, actual, score: 1, status: 'skipped', weight: 0 }
  if (expected === null && actual === null) return { field, expected, actual, score: 1, status: 'exact', weight: w }
  if (expected === null) return { field, expected, actual, score: 0, status: 'hallucinated', weight: w }
  if (actual === null || actual === undefined) return { field, expected, actual, score: 0, status: 'missing', weight: w }
  const diff = Math.abs(Number(expected) - Number(actual))
  if (diff <= tolerance) return { field, expected, actual, score: 1, status: 'exact', weight: w }
  if (diff <= tolerance * 3) return { field, expected, actual, score: 0.5, status: 'partial', weight: w }
  return { field, expected, actual, score: 0, status: 'hallucinated', weight: w }
}

// ── Evaluacion completa de un caso ──

export function evaluateCase(
  goldCase: GoldStandardCase,
  actual: AnamnesisExtractionResult,
): CaseResult {
  const fields: FieldScore[] = []
  const exp = goldCase.expected

  // normalizedOpenFields
  const expNof = exp.normalizedOpenFields
  const actNof = actual.normalizedOpenFields
  if (expNof) {
    fields.push(scoreNullableNumber(expNof.ageMonths, actNof?.ageMonths, 'ageMonths'))
    fields.push(scoreEnum(expNof.occupationCategory, actNof?.occupationCategory, 'occupationCategory'))
    fields.push(scoreEnum(expNof.chiefComplaintCode, actNof?.chiefComplaintCode, 'chiefComplaintCode'))
    fields.push(scoreArray(expNof.medicationFamilies, actNof?.medicationFamilies, 'medicationFamilies'))
    fields.push(scoreArray(expNof.allergyGroups, actNof?.allergyGroups, 'allergyGroups'))
    fields.push(scoreEnum(expNof.fatherDeathCause, actNof?.fatherDeathCause, 'fatherDeathCause'))
    fields.push(scoreEnum(expNof.motherDeathCause, actNof?.motherDeathCause, 'motherDeathCause'))
    fields.push(scoreEnum(expNof.chestPainPhenotype, actNof?.chestPainPhenotype, 'chestPainPhenotype'))
    fields.push(scoreEnum(expNof.coughPhenotype, actNof?.coughPhenotype, 'coughPhenotype'))
    fields.push(scoreArray(expNof.redFlagCodes, actNof?.redFlagCodes, 'redFlagCodes'))
  }

  // chiefComplaint
  if (exp.chiefComplaint) {
    if (exp.chiefComplaint.contextualMismatch !== undefined) {
      fields.push(scoreBoolean(
        exp.chiefComplaint.contextualMismatch,
        actual.chiefComplaint?.contextualMismatch,
        'contextualMismatch',
      ))
    }
  }

  // safetyFlags — evaluamos recall de terminos clave si se proveen expected flags
  if (exp.safetyFlags !== undefined) {
    fields.push(scoreArray(
      exp.safetyFlags as string[],
      actual.safetyFlags,
      'safetyFlags',
    ))
  }

  // Narrativa
  const narrativeScore = narrativeKeyTermScore(
    actual.presentIllness?.clinicalNarrative ?? '',
    goldCase.narrativeKeyTerms,
  )

  // Overall: weighted average
  const activeFields = fields.filter(f => f.weight > 0)
  const totalWeight = activeFields.reduce((sum, f) => sum + f.weight, 0) + 2 // +2 for narrative
  const totalScore = activeFields.reduce((sum, f) => sum + f.score * f.weight, 0) + narrativeScore * 2

  return {
    caseId: goldCase.id,
    caseName: goldCase.name,
    tags: goldCase.tags,
    fields,
    narrativeScore,
    overallScore: totalWeight > 0 ? totalScore / totalWeight : 0,
  }
}

// ── Agregados ──

export function computeSummary(
  cases: CaseResult[],
  model: string,
  promptVersion: string,
): EvalSummary {
  const overall = cases.length > 0
    ? cases.reduce((s, c) => s + c.overallScore, 0) / cases.length
    : 0

  // Safety flags recall across all cases
  const sfFields = cases.flatMap(c => c.fields.filter(f => f.field === 'safetyFlags'))
  const safetyFlagsRecall = sfFields.length > 0
    ? sfFields.reduce((s, f) => s + f.score, 0) / sfFields.length
    : 1.0

  // Chief complaint accuracy
  const ccFields = cases.flatMap(c => c.fields.filter(f => f.field === 'chiefComplaintCode'))
  const chiefComplaintAccuracy = ccFields.length > 0
    ? ccFields.reduce((s, f) => s + f.score, 0) / ccFields.length
    : 1.0

  // Medication families F1
  const mfFields = cases.flatMap(c => c.fields.filter(f => f.field === 'medicationFamilies'))
  const medicationFamiliesF1 = mfFields.length > 0
    ? mfFields.reduce((s, f) => s + f.score, 0) / mfFields.length
    : 1.0

  return {
    timestamp: new Date().toISOString(),
    model,
    promptVersion,
    cases,
    overall,
    safetyFlagsRecall,
    chiefComplaintAccuracy,
    medicationFamiliesF1,
  }
}

// ── Generacion de reporte markdown ──

export function generateMarkdownReport(summary: EvalSummary, previousSummary?: EvalSummary): string {
  const lines: string[] = []
  const fmt = (n: number) => n.toFixed(2)
  const delta = (current: number, prev: number | undefined) =>
    prev !== undefined ? ` (${current >= prev ? '+' : ''}${fmt(current - prev)})` : ''

  lines.push('# Anamnesis Extraction Evaluation')
  lines.push(`Date: ${summary.timestamp.split('T')[0]}`)
  lines.push(`Model: ${summary.model}`)
  lines.push(`Prompt: ${summary.promptVersion}`)
  lines.push('')

  lines.push('## Summary')
  lines.push('| Metric | Score |')
  lines.push('|--------|-------|')
  lines.push(`| Overall | ${fmt(summary.overall)}${delta(summary.overall, previousSummary?.overall)} |`)
  lines.push(`| Safety Flags Recall | ${fmt(summary.safetyFlagsRecall)}${delta(summary.safetyFlagsRecall, previousSummary?.safetyFlagsRecall)} |`)
  lines.push(`| Chief Complaint Accuracy | ${fmt(summary.chiefComplaintAccuracy)}${delta(summary.chiefComplaintAccuracy, previousSummary?.chiefComplaintAccuracy)} |`)
  lines.push(`| Medication Families F1 | ${fmt(summary.medicationFamiliesF1)}${delta(summary.medicationFamiliesF1, previousSummary?.medicationFamiliesF1)} |`)
  lines.push('')

  for (const caseResult of summary.cases) {
    lines.push(`## Case: ${caseResult.caseName}`)
    lines.push(`ID: \`${caseResult.caseId}\` | Tags: ${caseResult.tags.join(', ')} | Overall: **${fmt(caseResult.overallScore)}**`)
    lines.push('')
    lines.push('| Field | Expected | Actual | Score | Status |')
    lines.push('|-------|----------|--------|-------|--------|')
    for (const f of caseResult.fields) {
      if (f.status === 'skipped') continue
      const expStr = JSON.stringify(f.expected) ?? '-'
      const actStr = JSON.stringify(f.actual) ?? '-'
      const truncate = (s: string, max: number) => s.length > max ? s.slice(0, max) + '...' : s
      lines.push(`| ${f.field} | ${truncate(expStr, 40)} | ${truncate(actStr, 40)} | ${fmt(f.score)} | ${f.status} |`)
    }
    lines.push(`| clinicalNarrative (key terms) | - | - | ${fmt(caseResult.narrativeScore)} | ${caseResult.narrativeScore >= 0.8 ? 'exact' : caseResult.narrativeScore >= 0.5 ? 'partial' : 'missing'} |`)
    lines.push('')
  }

  if (previousSummary) {
    lines.push('## Regressions vs Previous Run')
    lines.push(`Previous: ${previousSummary.timestamp.split('T')[0]} | Overall: ${fmt(previousSummary.overall)}`)
    lines.push('')
    const regressions: string[] = []
    for (const current of summary.cases) {
      const prev = previousSummary.cases.find(c => c.caseId === current.caseId)
      if (prev && current.overallScore < prev.overallScore - 0.05) {
        regressions.push(`- **${current.caseName}**: ${fmt(prev.overallScore)} -> ${fmt(current.overallScore)} (${fmt(current.overallScore - prev.overallScore)})`)
      }
    }
    if (regressions.length === 0) {
      lines.push('No regressions detected (threshold: -0.05).')
    } else {
      lines.push(...regressions)
    }
    lines.push('')
  }

  return lines.join('\n')
}
