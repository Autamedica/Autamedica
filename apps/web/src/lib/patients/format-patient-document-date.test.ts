import { describe, expect, it } from 'vitest'
import { formatPatientDocumentDate } from './format-patient-document-date'

describe('formatPatientDocumentDate', () => {
  it('preserves date-only values in the local calendar for Argentina', () => {
    expect(formatPatientDocumentDate('2026-05-11', 'es-AR')).toBe('11 de mayo de 2026')
  })

  it('preserves date-only values in the local calendar for Brazil', () => {
    expect(formatPatientDocumentDate('2026-05-11', 'pt-BR')).toBe('11 de maio de 2026')
  })

  it('keeps localized empty and invalid labels', () => {
    expect(formatPatientDocumentDate(null, 'es-AR')).toBe('Sin fecha')
    expect(formatPatientDocumentDate('2026-02-30', 'pt-BR')).toBe('Sem data')
  })
})
