import { describe, expect, it } from 'vitest'
import { buildHistoricalContext, type HistoricalVersionInput } from './anamnesis-historical-context.usecase'

function makeVersion(input: Partial<HistoricalVersionInput> & Pick<HistoricalVersionInput, 'versionNumber'>): HistoricalVersionInput {
  return {
    versionNumber: input.versionNumber,
    createdAt: input.createdAt ?? '2026-04-01T00:00:00.000Z',
    notes: input.notes ?? null,
    relevance: input.relevance ?? null,
    sectionsSnapshot: input.sectionsSnapshot ?? [],
    extractionSnapshot: input.extractionSnapshot ?? null,
  }
}

describe('buildHistoricalContext', () => {
  it('keeps global context but excludes unrelated prior episodes', () => {
    const context = buildHistoricalContext({
      currentSections: [
        {
          section: 'motivo_consulta',
          data: { sintoma_principal: 'Me torci el tobillo jugando al futbol' },
          completed: true,
        },
      ],
      versions: [
        makeVersion({
          versionNumber: 1,
          notes: 'Consulta previa por dolor abdominal',
          sectionsSnapshot: [
            {
              section: 'motivo_consulta',
              data: { sintoma_principal: 'Dolor abdominal con vomitos' },
              completed: true,
            },
            {
              section: 'medicamentos',
              data: { lista_medicamentos: 'Enalapril 10 mg por dia' },
              completed: true,
            },
          ],
        }),
      ],
    })

    expect(context?.globalContext?.medications.values).toEqual(['Enalapril 10 mg por dia'])
    expect(context?.relatedEpisodes).toEqual([])
  })

  it('includes prior episodes when they share the same clinical axis', () => {
    const context = buildHistoricalContext({
      currentSections: [
        {
          section: 'motivo_consulta',
          data: { sintoma_principal: 'Dolor abdominal con nauseas y distension' },
          completed: true,
        },
      ],
      versions: [
        makeVersion({
          versionNumber: 2,
          relevance: 'follow_up',
          sectionsSnapshot: [
            {
              section: 'motivo_consulta',
              data: { sintoma_principal: 'Dolor abdominal de 3 dias' },
              completed: true,
            },
          ],
        }),
      ],
    })

    expect(context?.relatedEpisodes).toHaveLength(1)
    expect(context?.relatedEpisodes[0]?.relatedSystems).toContain('digestivo')
  })

  it('detects chronic disease continuity even when the manifestation changes', () => {
    const context = buildHistoricalContext({
      currentSections: [
        {
          section: 'motivo_consulta',
          data: { sintoma_principal: 'Me aparecio un rash en alas de mariposa en la cara' },
          completed: true,
        },
      ],
      versions: [
        makeVersion({
          versionNumber: 3,
          relevance: 'follow_up',
          notes: 'Seguimiento por dolor toracico pleuritico',
          sectionsSnapshot: [
            {
              section: 'motivo_consulta',
              data: { sintoma_principal: 'Dolor toracico pleuritico con falta de aire' },
              completed: true,
            },
            {
              section: 'enfermedades_previas',
              data: { enfermedades_cronicas: ['lupus'] },
              completed: true,
            },
            {
              section: 'medicamentos',
              data: { lista_medicamentos: 'Prednisona 10 mg por dia' },
              completed: true,
            },
          ],
        }),
      ],
    })

    expect(context?.globalContext?.chronicConditions.values).toContain('lupus')
    expect(context?.relatedEpisodes).toHaveLength(1)
    expect(context?.relatedEpisodes[0]?.relationReasons.join(' ')).toContain('continuidad')
  })
})
