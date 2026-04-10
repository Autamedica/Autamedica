import { describe, expect, it } from 'vitest'
import { generatePsychiatryIntakePdf } from './psychiatry-intake-pdf-report.service'

function makeBaseInput() {
  return {
    patient: {
      name: 'Paciente de prueba',
      age: 29,
      gender: 'Femenino',
    },
    intake: {
      id: 'intake-1',
      completionPercentage: 100,
      completedAt: '2026-04-10T12:00:00.000Z',
      updatedAt: '2026-04-10T12:00:00.000Z',
    },
    sections: [
      {
        section: 'intake_context',
        phase: 'wizard_intake',
        data: {
          motivo_consulta: 'Control de continuidad',
          diagnostico_texto: 'TDAH',
          medicacion_actual: 'Metilfenidato',
          dosis_actual: '10 mg',
        },
      },
    ],
  }
}

describe('generatePsychiatryIntakePdf', () => {
  it('does not throw when triage is missing', () => {
    expect(() => generatePsychiatryIntakePdf(makeBaseInput())).not.toThrow()
  })

  it('does not throw when triage is a partial object from legacy clinical state rows', () => {
    expect(() =>
      generatePsychiatryIntakePdf({
        ...makeBaseInput(),
        triage: {},
      }),
    ).not.toThrow()
  })

  it('renders when triage has priority but no references', () => {
    const result = generatePsychiatryIntakePdf({
      ...makeBaseInput(),
      triage: {
        priority: 'priority',
        mandate: 'Revisión prioritaria',
        suggestedAction: 'Contactar al paciente hoy',
      },
    })

    expect(result.filename).toContain('evaluacion-psiquiatrica-')
    expect(result.buffer.byteLength).toBeGreaterThan(0)
  })
})
