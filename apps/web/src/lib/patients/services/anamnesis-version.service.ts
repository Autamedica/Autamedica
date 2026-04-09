/**
 * Service: Anamnesis version management.
 * Capa 6 -- Snapshot creation, diff computation, version orchestration.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import {
  createAnamnesisVersionsAdapter,
  type AnamnesisVersion,
  type VersionTrigger,
  type VersionRelevance,
} from '@/lib/patients/lib/repos/anamnesis-versions.adapter'
import { createAnamnesisAdapter } from '@/lib/patients/lib/repos/anamnesis.adapter'
import { createAnamnesisExtractionAdapter } from '@/lib/patients/lib/repos/anamnesis-extraction.adapter'

type Db = SupabaseClient<Database>

interface SectionSnapshot {
  section: string
  data: Record<string, unknown>
  completed: boolean
}

export interface ChangesSummary {
  added: string[]
  modified: string[]
  unchanged: string[]
  fieldChanges: { section: string; field: string; from: unknown; to: unknown }[]
}

function computeDiff(
  prev: SectionSnapshot[],
  current: SectionSnapshot[],
): ChangesSummary {
  const prevMap = new Map(prev.map(s => [s.section, s]))
  const currentMap = new Map(current.map(s => [s.section, s]))

  const added: string[] = []
  const modified: string[] = []
  const unchanged: string[] = []
  const fieldChanges: ChangesSummary['fieldChanges'] = []

  for (const [section, cur] of currentMap) {
    const prevSection = prevMap.get(section)

    if (!prevSection) {
      added.push(section)
      continue
    }

    const prevJson = JSON.stringify(prevSection.data)
    const curJson = JSON.stringify(cur.data)

    if (prevJson === curJson) {
      unchanged.push(section)
    } else {
      modified.push(section)
      const allKeys = new Set([...Object.keys(prevSection.data), ...Object.keys(cur.data)])
      for (const key of allKeys) {
        const prevVal = prevSection.data[key]
        const curVal = cur.data[key]
        if (JSON.stringify(prevVal) !== JSON.stringify(curVal)) {
          fieldChanges.push({ section, field: key, from: prevVal ?? null, to: curVal ?? null })
        }
      }
    }
  }

  return { added, modified, unchanged, fieldChanges }
}

function inferRelevance(diff: ChangesSummary, trigger: VersionTrigger): VersionRelevance {
  if (trigger === 'initial') return 'routine'
  if (diff.added.length > 0) return 'new_symptom'
  if (diff.modified.length > 0) return 'follow_up'
  return 'routine'
}

const SECTION_LABELS: Record<string, string> = {
  edad: 'Datos personales',
  ocupacion: 'Ocupacion',
  motivo_consulta: 'Motivo de consulta',
  enfermedades_previas: 'Enfermedades previas',
  medicamentos: 'Medicamentos',
  alergias: 'Alergias',
  antecedentes_familiares: 'Antecedentes familiares',
  habitos: 'Habitos',
  cardiovascular: 'Cardiovascular',
  respiratorio: 'Respiratorio',
  digestivo: 'Digestivo',
  genitourinario: 'Genitourinario',
  resumen_final: 'Resumen',
}

function generateVersionNotes(
  trigger: VersionTrigger,
  snapshot: SectionSnapshot[],
  diff: ChangesSummary | null,
): string {
  const completedSections = snapshot.filter(s => s.completed)

  if (trigger === 'initial') {
    const motivo = snapshot.find(s => s.section === 'motivo_consulta')
    const sintomaTexto = motivo?.data?.sintoma_principal as string | undefined
    const edad = snapshot.find(s => s.section === 'edad')
    const edadVal = edad?.data?.edad as number | undefined

    const parts: string[] = []
    parts.push(`Historia clinica inicial: ${completedSections.length} secciones`)
    if (edadVal) parts[0] += `, ${edadVal} anios`
    if (sintomaTexto) parts.push(`Motivo: ${sintomaTexto.slice(0, 80)}`)
    return parts.join('. ')
  }

  if (!diff) return `Actualizacion con ${completedSections.length} secciones`

  const parts: string[] = []
  if (diff.added.length > 0) {
    parts.push(`Nuevas: ${diff.added.map(s => SECTION_LABELS[s] ?? s).join(', ')}`)
  }
  if (diff.modified.length > 0) {
    parts.push(`Actualizadas: ${diff.modified.map(s => SECTION_LABELS[s] ?? s).join(', ')}`)
  }
  if (diff.fieldChanges.length > 0 && diff.fieldChanges.length <= 3) {
    const details = diff.fieldChanges.map(fc => {
      const label = SECTION_LABELS[fc.section] ?? fc.section
      return `${label}/${fc.field}`
    })
    parts.push(`Campos: ${details.join(', ')}`)
  }

  return parts.length > 0 ? parts.join('. ') : `Revision con ${completedSections.length} secciones`
}

export const anamnesisVersionService = {
  async createVersion(
    supabase: Db,
    patientId: string,
    anamnesisId: string,
    trigger: VersionTrigger,
    notes?: string,
  ): Promise<AnamnesisVersion> {
    const anamnesisRepo = createAnamnesisAdapter(supabase)
    const anamnesisExtractionRepo = createAnamnesisExtractionAdapter(supabase)
    const anamnesisVersionsRepo = createAnamnesisVersionsAdapter(supabase)

    const sections = await anamnesisRepo.getSections(anamnesisId)
    const currentSnapshot: SectionSnapshot[] = sections.map(s => ({
      section: typeof s.section === 'string' ? s.section : '',
      data: (s.data ?? {}) as Record<string, unknown>,
      completed: s.completed ?? false,
    }))

    const extraction = await anamnesisExtractionRepo.getLatest(anamnesisId)
      .catch(() => null)

    const prevVersion = await anamnesisVersionsRepo.getLatest(anamnesisId)
      .catch(() => null)
    const nextVersionNumber = prevVersion ? prevVersion.version_number + 1 : 1

    let changesSummary: ChangesSummary | null = null
    if (prevVersion && Array.isArray(prevVersion.sections_snapshot)) {
      const prevSnapshot = prevVersion.sections_snapshot as unknown as SectionSnapshot[]
      changesSummary = computeDiff(prevSnapshot, currentSnapshot)
    }

    const relevance = changesSummary
      ? inferRelevance(changesSummary, trigger)
      : (trigger === 'initial' ? 'routine' as const : 'follow_up' as const)

    const version = await anamnesisVersionsRepo.insert({
      anamnesis_id: anamnesisId,
      patient_id: patientId,
      version_number: nextVersionNumber,
      trigger,
      sections_snapshot: currentSnapshot as unknown as Record<string, unknown>[],
      extraction_snapshot: extraction?.extractionResult ?? null,
      changes_summary: changesSummary ? {
        added: changesSummary.added,
        modified: changesSummary.modified,
        unchanged: changesSummary.unchanged,
      } : null,
      relevance,
      notes: notes ?? generateVersionNotes(trigger, currentSnapshot, changesSummary),
    })

    logger.info('[anamnesisVersionService] Version created', {
      anamnesisId,
      versionNumber: nextVersionNumber,
      trigger,
      relevance,
      added: changesSummary?.added.length ?? 0,
      modified: changesSummary?.modified.length ?? 0,
    })

    return version
  },

  async listVersions(supabase: Db, anamnesisId: string): Promise<AnamnesisVersion[]> {
    const anamnesisVersionsRepo = createAnamnesisVersionsAdapter(supabase)
    return anamnesisVersionsRepo.listByAnamnesis(anamnesisId)
  },

  async getVersion(supabase: Db, anamnesisId: string, versionNumber: number): Promise<AnamnesisVersion | null> {
    const anamnesisVersionsRepo = createAnamnesisVersionsAdapter(supabase)
    return anamnesisVersionsRepo.getByVersion(anamnesisId, versionNumber)
  },
}
