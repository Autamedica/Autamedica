/**
 * Tests para el framework de evaluacion de anamnesis.
 * Testea funciones de scoring, no la extraccion AI.
 *
 * Uso: cd ~/Autamedica && bun test scripts/eval/anamnesis-eval.test.ts
 */

import { describe, test, expect } from 'bun:test'
import {
  jaccardSimilarity,
  precision,
  recall,
  f1Score,
  narrativeKeyTermScore,
  evaluateCase,
  computeSummary,
  generateMarkdownReport,
} from './scoring'
import { GOLD_STANDARD } from './anamnesis-gold-standard'
import { MOCK_OUTPUTS } from './mock-outputs'

// ── Jaccard Similarity ──

describe('jaccardSimilarity', () => {
  test('arrays identicos = 1.0', () => {
    expect(jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1.0)
  })

  test('arrays vacios = 1.0', () => {
    expect(jaccardSimilarity([], [])).toBe(1.0)
  })

  test('sin overlap = 0.0', () => {
    expect(jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBe(0.0)
  })

  test('overlap parcial', () => {
    // intersection = {a, b} = 2, union = {a, b, c, d} = 4 -> 0.5
    expect(jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'd'])).toBeCloseTo(0.5)
  })

  test('subconjunto', () => {
    // intersection = {a} = 1, union = {a, b, c} = 3 -> 0.333
    expect(jaccardSimilarity(['a'], ['a', 'b', 'c'])).toBeCloseTo(1 / 3)
  })

  test('duplicados se ignoran (set)', () => {
    expect(jaccardSimilarity(['a', 'a', 'b'], ['a', 'b'])).toBe(1.0)
  })
})

// ── Precision / Recall / F1 ──

describe('precision', () => {
  test('perfecto', () => {
    expect(precision(['a', 'b'], ['a', 'b'])).toBe(1.0)
  })

  test('actual vacio cuando expected vacio', () => {
    expect(precision([], [])).toBe(1.0)
  })

  test('actual vacio cuando expected tiene items', () => {
    expect(precision(['a'], [])).toBe(0.0)
  })

  test('hallucinated items', () => {
    // actual = [a, b, x], expected = [a, b] -> 2/3
    expect(precision(['a', 'b'], ['a', 'b', 'x'])).toBeCloseTo(2 / 3)
  })
})

describe('recall', () => {
  test('perfecto', () => {
    expect(recall(['a', 'b'], ['a', 'b'])).toBe(1.0)
  })

  test('expected vacio', () => {
    expect(recall([], ['a'])).toBe(0.0) // hallucination penalty
  })

  test('missing items', () => {
    expect(recall(['a', 'b', 'c'], ['a'])).toBeCloseTo(1 / 3)
  })
})

describe('f1Score', () => {
  test('perfecto', () => {
    expect(f1Score(['a', 'b'], ['a', 'b'])).toBe(1.0)
  })

  test('sin overlap', () => {
    expect(f1Score(['a'], ['b'])).toBe(0)
  })

  test('parcial', () => {
    // p = 1/2, r = 1/2, f1 = 0.5
    expect(f1Score(['a', 'b'], ['a', 'c'])).toBeCloseTo(0.5)
  })
})

// ── Narrative Key Terms ──

describe('narrativeKeyTermScore', () => {
  test('todos los terminos presentes', () => {
    expect(narrativeKeyTermScore(
      'El paciente tiene cefalea con presion en la frente',
      ['cefalea', 'presion', 'frente'],
    )).toBe(1.0)
  })

  test('sin terminos esperados = 1.0', () => {
    expect(narrativeKeyTermScore('cualquier texto', [])).toBe(1.0)
  })

  test('ningun termino encontrado = 0.0', () => {
    expect(narrativeKeyTermScore('texto irrelevante', ['cefalea', 'fiebre'])).toBe(0.0)
  })

  test('parcial', () => {
    expect(narrativeKeyTermScore(
      'El paciente tiene cefalea',
      ['cefalea', 'fiebre', 'disnea'],
    )).toBeCloseTo(1 / 3)
  })

  test('normaliza acentos', () => {
    expect(narrativeKeyTermScore(
      'Paciente con disuria y polaquiuria',
      ['disuria', 'polaquiuria'],
    )).toBe(1.0)
  })

  test('case insensitive', () => {
    expect(narrativeKeyTermScore(
      'CEFALEA intensa',
      ['cefalea'],
    )).toBe(1.0)
  })
})

// ── evaluateCase ──

describe('evaluateCase', () => {
  test('caso 1 con mock output produce score > 0.8', () => {
    const gold = GOLD_STANDARD[0]
    const mock = MOCK_OUTPUTS[gold.id]
    expect(mock).toBeDefined()
    const result = evaluateCase(gold, mock)
    expect(result.overallScore).toBeGreaterThan(0.8)
    expect(result.caseId).toBe('acute-headache-young')
  })

  test('caso 3 (red flags) con mock tiene score parcial en redFlagCodes', () => {
    const gold = GOLD_STANDARD[2]
    const mock = MOCK_OUTPUTS[gold.id]
    expect(mock).toBeDefined()
    const result = evaluateCase(gold, mock)

    const rfField = result.fields.find(f => f.field === 'redFlagCodes')
    expect(rfField).toBeDefined()
    // Mock solo tiene 1 de 2 red flags esperados -> jaccard = 1/2 = 0.5
    expect(rfField?.score).toBeCloseTo(0.5)
    expect(rfField?.status).toBe('partial')
  })

  test('caso 4 (reproductive) tiene error en occupationCategory', () => {
    const gold = GOLD_STANDARD[3]
    const mock = MOCK_OUTPUTS[gold.id]
    const result = evaluateCase(gold, mock)

    const occField = result.fields.find(f => f.field === 'occupationCategory')
    expect(occField).toBeDefined()
    expect(occField?.score).toBe(0)
    expect(occField?.status).toBe('hallucinated')
  })

  test('caso 5 (incomplete) maneja nulls correctamente', () => {
    const gold = GOLD_STANDARD[4]
    const mock = MOCK_OUTPUTS[gold.id]
    const result = evaluateCase(gold, mock)

    // ageMonths null === null -> exact
    const ageField = result.fields.find(f => f.field === 'ageMonths')
    expect(ageField).toBeDefined()
    expect(ageField?.score).toBe(1)
    expect(ageField?.status).toBe('exact')
  })

  test('narrative score se calcula para cada caso', () => {
    for (const gold of GOLD_STANDARD) {
      const mock = MOCK_OUTPUTS[gold.id]
      if (!mock) continue
      const result = evaluateCase(gold, mock)
      expect(result.narrativeScore).toBeGreaterThanOrEqual(0)
      expect(result.narrativeScore).toBeLessThanOrEqual(1)
    }
  })
})

// ── computeSummary ──

describe('computeSummary', () => {
  test('genera summary con todos los campos', () => {
    const results = GOLD_STANDARD
      .filter(g => MOCK_OUTPUTS[g.id])
      .map(g => evaluateCase(g, MOCK_OUTPUTS[g.id]))

    const summary = computeSummary(results, 'mock', 'test_v0')
    expect(summary.model).toBe('mock')
    expect(summary.promptVersion).toBe('test_v0')
    expect(summary.overall).toBeGreaterThan(0)
    expect(summary.overall).toBeLessThanOrEqual(1)
    expect(summary.safetyFlagsRecall).toBeGreaterThanOrEqual(0)
    expect(summary.chiefComplaintAccuracy).toBeGreaterThanOrEqual(0)
    expect(summary.medicationFamiliesF1).toBeGreaterThanOrEqual(0)
    expect(summary.cases.length).toBe(5)
  })
})

// ── generateMarkdownReport ──

describe('generateMarkdownReport', () => {
  test('genera markdown valido con headers', () => {
    const results = GOLD_STANDARD
      .filter(g => MOCK_OUTPUTS[g.id])
      .map(g => evaluateCase(g, MOCK_OUTPUTS[g.id]))

    const summary = computeSummary(results, 'mock', 'test_v0')
    const report = generateMarkdownReport(summary)

    expect(report).toContain('# Anamnesis Extraction Evaluation')
    expect(report).toContain('## Summary')
    expect(report).toContain('| Overall |')
    expect(report).toContain('| Safety Flags Recall |')
    expect(report).toContain('## Case:')
  })

  test('incluye regressions si hay resultado previo', () => {
    const results = GOLD_STANDARD
      .filter(g => MOCK_OUTPUTS[g.id])
      .map(g => evaluateCase(g, MOCK_OUTPUTS[g.id]))

    const current = computeSummary(results, 'mock', 'test_v0')
    // Simular un resultado previo con score mas alto
    const prev: typeof current = {
      ...current,
      overall: current.overall + 0.1,
      timestamp: '2026-03-30T00:00:00.000Z',
    }

    const report = generateMarkdownReport(current, prev)
    expect(report).toContain('## Regressions vs Previous Run')
  })

  test('sin resultado previo no incluye regressions', () => {
    const results = GOLD_STANDARD
      .filter(g => MOCK_OUTPUTS[g.id])
      .map(g => evaluateCase(g, MOCK_OUTPUTS[g.id]))

    const summary = computeSummary(results, 'mock', 'test_v0')
    const report = generateMarkdownReport(summary)
    expect(report).not.toContain('## Regressions')
  })
})

// ── Gold Standard Dataset Integrity ──

describe('gold standard dataset', () => {
  test('tiene 5 casos', () => {
    expect(GOLD_STANDARD.length).toBe(5)
  })

  test('todos los ids son unicos', () => {
    const ids = GOLD_STANDARD.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('todos los casos tienen sections no vacias', () => {
    for (const c of GOLD_STANDARD) {
      expect(c.sections.length).toBeGreaterThan(0)
    }
  })

  test('todos los casos tienen narrativeKeyTerms', () => {
    for (const c of GOLD_STANDARD) {
      expect(c.narrativeKeyTerms.length).toBeGreaterThan(0)
    }
  })

  test('todos los mock outputs existen para cada caso', () => {
    for (const c of GOLD_STANDARD) {
      expect(MOCK_OUTPUTS[c.id]).toBeDefined()
    }
  })
})
