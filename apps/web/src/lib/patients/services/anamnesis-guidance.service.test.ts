import { describe, expect, it } from 'vitest'
import {
  transformGuidance,
  hasActionableGuidance,
  type ExtractionGuidance,
} from './anamnesis-guidance.service'
import type { ExtractionServiceResult } from './anamnesis-extraction.service'

// --- Fixtures ---

function makeResult(overrides: Partial<ExtractionServiceResult['guidance']> & { hasCritical?: boolean } = {}): ExtractionServiceResult {
  const { hasCritical, ...guidanceOverrides } = overrides
  return {
    extractionId: 'ext-1',
    checkpoint: 'partial',
    hasCriticalQuestions: hasCritical ?? false,
    guidance: {
      nextQuestions: [],
      qualityAlerts: [],
      coverage: { adequate: [], weak: [] },
      safetyFlags: [],
      ...guidanceOverrides,
    },
  }
}

function makeQuestion(priority: 'critical' | 'high' | 'medium' = 'medium') {
  return {
    priority,
    targetSection: 'motivo_consulta',
    questionType: 'open' as const,
    question: `Pregunta ${priority}`,
    rationale: `Razón ${priority}`,
  }
}

function makeAlert(severity: 'low' | 'medium' | 'high' = 'medium') {
  return {
    severity,
    code: `alert-${severity}`,
    message: `Alerta ${severity}`,
    sourceSections: ['motivo_consulta'],
  }
}

// --- transformGuidance ---

describe('transformGuidance', () => {
  it('returns empty questions when no nextQuestions', () => {
    const result = transformGuidance(makeResult())
    expect(result.questions).toHaveLength(0)
  })

  it('sorts questions by priority: critical > high > medium', () => {
    const result = transformGuidance(makeResult({
      nextQuestions: [
        makeQuestion('medium'),
        makeQuestion('critical'),
        makeQuestion('high'),
      ],
    }))
    expect(result.questions[0].priority).toBe('critical')
    expect(result.questions[1].priority).toBe('high')
    expect(result.questions[2].priority).toBe('medium')
  })

  it('limits questions to 3 (MAX_QUESTIONS_PER_CHECKPOINT)', () => {
    const result = transformGuidance(makeResult({
      nextQuestions: [
        makeQuestion('critical'),
        makeQuestion('high'),
        makeQuestion('high'),
        makeQuestion('medium'),
        makeQuestion('medium'),
      ],
    }))
    expect(result.questions).toHaveLength(3)
    expect(result.questions[0].priority).toBe('critical')
  })

  it('filters out low severity alerts', () => {
    const result = transformGuidance(makeResult({
      qualityAlerts: [
        makeAlert('low'),
        makeAlert('medium'),
        makeAlert('high'),
      ],
    }))
    expect(result.alerts).toHaveLength(2)
    expect(result.alerts[0]).toBe('Alerta medium')
    expect(result.alerts[1]).toBe('⚠️ Alerta high')
  })

  it('maps section IDs to labels for coverage and gaps', () => {
    const result = transformGuidance(makeResult({
      coverage: {
        adequate: ['motivo_consulta'],
        weak: ['revision_sistemas'],
      },
    }))
    expect(result.coverage).toEqual(['Motivo de consulta'])
    expect(result.gaps).toEqual(['Revisión por sistemas'])
  })

  it('preserves unknown section IDs as-is', () => {
    const result = transformGuidance(makeResult({
      coverage: { adequate: ['custom_section'], weak: [] },
    }))
    expect(result.coverage).toEqual(['custom_section'])
  })

  it('passes through hasCriticalQuestions', () => {
    const result = transformGuidance(makeResult({ hasCritical: true }))
    expect(result.hasCritical).toBe(true)
  })

  it('builds coverage summary with adequate and weak counts', () => {
    const result = transformGuidance(makeResult({
      coverage: {
        adequate: ['motivo_consulta', 'antecedentes_personales'],
        weak: ['revision_sistemas'],
      },
    }))
    expect(result.coverageSummary).toContain('2 de 3')
    expect(result.coverageSummary).toContain('Revisión por sistemas')
  })

  it('maps questionType closed to inputType select', () => {
    const result = transformGuidance(makeResult({
      nextQuestions: [{
        ...makeQuestion(),
        questionType: 'closed',
      }],
    }))
    expect(result.questions[0].inputType).toBe('select')
  })

  it('maps questionType open to inputType text', () => {
    const result = transformGuidance(makeResult({
      nextQuestions: [makeQuestion()],
    }))
    expect(result.questions[0].inputType).toBe('text')
  })
})

// --- hasActionableGuidance ---

describe('hasActionableGuidance', () => {
  const base: ExtractionGuidance = {
    questions: [],
    alerts: [],
    coverageSummary: '',
    coverage: [],
    gaps: [],
    hasCritical: false,
  }

  it('returns false when everything is empty', () => {
    expect(hasActionableGuidance(base)).toBe(false)
  })

  it('returns true when there are questions', () => {
    expect(hasActionableGuidance({
      ...base,
      questions: [{ id: 'q-1', text: 'test', rationale: '', inputType: 'text', targetSection: '', priority: 'medium' }],
    })).toBe(true)
  })

  it('returns true when there are gaps', () => {
    expect(hasActionableGuidance({
      ...base,
      gaps: ['Revisión por sistemas'],
    })).toBe(true)
  })

  it('returns false when only coverage exists (no questions, no gaps)', () => {
    expect(hasActionableGuidance({
      ...base,
      coverage: ['Motivo de consulta', 'Antecedentes'],
    })).toBe(false)
  })

  it('returns true when questions AND coverage exist', () => {
    expect(hasActionableGuidance({
      ...base,
      questions: [{ id: 'q-1', text: 'test', rationale: '', inputType: 'text', targetSection: '', priority: 'medium' }],
      coverage: ['Motivo de consulta'],
    })).toBe(true)
  })
})
