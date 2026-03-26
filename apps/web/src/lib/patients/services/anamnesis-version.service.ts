/**
 * Service: Anamnesis version management.
 * Capa 6 — Snapshot creation, diff computation, version orchestration.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import {
  anamnesisVersionsRepo,
  type AnamnesisVersion,
  type VersionTrigger,
  type VersionRelevance,
} from '@/lib/patients/lib/repos/anamnesis-versions.repo'
import { anamnesisRepo } from '@/lib/patients/lib/repos/anamnesis.repo'
import { anamnesisExtractionRepo } from '@/lib/patients/lib/repos/anamnesis-extraction.repo'

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

/**
 * Computes diff between two section snapshots.
 * Identifies added, modified, and unchanged sections + field-level changes.
 */
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
      // Compute field-level changes
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

/**
 * Determines relevance based on diff analysis.
 */
function inferRelevance(diff: ChangesSummary, trigger: VersionTrigger): VersionRelevance {
  if (trigger === 'initial') return 'routine'
  if (diff.added.length > 0) return 'new_symptom'
  if (diff.modified.length > 0) return 'follow_up'
  return 'routine'
}

const SECTION_LABELS: Record<string, string> = {
  edad: 'Datos personales',
  ocupacion: 'Ocupación',
  motivo_consulta: 'Motivo de consulta',
  enfermedades_previas: 'Enfermedades previas',
  medicamentos: 'Medicamentos',
  alergias: 'Alergias',
  antecedentes_familiares: 'Antecedentes familiares',
  habitos: 'Hábitos',
  cardiovascular: 'Cardiovascular',
  respiratorio: 'Respiratorio',
  digestivo: 'Digestivo',
  genitourinario: 'Genitourinario',
  resumen_final: 'Resumen',
}

/**
 * Generates a descriptive auto-summary of what this version contains.
 * Like a git commit message — explains the clinical state, not just "v1".
 */
function generateVersionNotes(
  trigger: VersionTrigger,
  snapshot: SectionSnapshot[],
  diff: ChangesSummary | null,
): string {
  const completedSections = snapshot.filter(s => s.completed)

  if (trigger === 'initial') {
    // Extract key clinical data for the summary
    const motivo = snapshot.find(s => s.section === 'motivo_consulta')
    const sintomaTexto = motivo?.data?.sintoma_principal as string | undefined
    const edad = snapshot.find(s => s.section === 'edad')
    const edadVal = edad?.data?.edad as number | undefined

    const parts: string[] = []
    parts.push(`Historia clínica inicial: ${completedSections.length} secciones`)
    if (edadVal) parts[0] += `, ${edadVal} años`
    if (sintomaTexto) parts.push(`Motivo: ${sintomaTexto.slice(0, 80)}`)
    return parts.join('. ')
  }

  if (!diff) return `Actualización con ${completedSections.length} secciones`

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

  return parts.length > 0 ? parts.join('. ') : `Revisión con ${completedSections.length} secciones`
}

export const anamnesisVersionService = {
  /**
   * Creates a new version snapshot from current anamnesis state.
   * Called automatically when anamnesis is completed or updated.
   */
  async createVersion(
    supabase: Db,
    patientId: string,
    anamnesisId: string,
    trigger: VersionTrigger,
    notes?: string,
  ): Promise<AnamnesisVersion> {
    // 1. Get current sections
    const sections = await anamnesisRepo.getSections(supabase, anamnesisId)
    const currentSnapshot: SectionSnapshot[] = sections.map(s => ({
      section: typeof s.section === 'string' ? s.section : '',
      data: (s.data ?? {}) as Record<string, unknown>,
      completed: s.completed ?? false,
    }))

    // 2. Get latest extraction (if exists)
    const extraction = await anamnesisExtractionRepo.getLatest(supabase, anamnesisId)
      .catch(() => null)

    // 3. Get previous version for diff
    const prevVersion = await anamnesisVersionsRepo.getLatest(supabase, anamnesisId)
    const nextVersionNumber = prevVersion ? prevVersion.version_number + 1 : 1

    // 4. Compute diff
    let changesSummary: ChangesSummary | null = null
    if (prevVersion && Array.isArray(prevVersion.sections_snapshot)) {
      const prevSnapshot = prevVersion.sections_snapshot as unknown as SectionSnapshot[]
      changesSummary = computeDiff(prevSnapshot, currentSnapshot)
    }

    // 5. Determine relevance
    const relevance = changesSummary
      ? inferRelevance(changesSummary, trigger)
      : (trigger === 'initial' ? 'routine' as const : 'follow_up' as const)

    // 6. Insert version
    const version = await anamnesisVersionsRepo.insert(supabase, {
      anamnesis_id: anamnesisId,
      patient_id: patientId,
      version_number: nextVersionNumber,
      trigger,
      sections_snapshot: currentSnapshot as unknown as Record<string, unknown>[],
      extraction_snapshot: extraction?.extraction_result ?? null,
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

  /**
   * Lists all versions for an anamnesis.
   */
  async listVersions(supabase: Db, anamnesisId: string): Promise<AnamnesisVersion[]> {
    return anamnesisVersionsRepo.listByAnamnesis(supabase, anamnesisId)
  },

  /**
   * Gets a specific version by number.
   */
  async getVersion(supabase: Db, anamnesisId: string, versionNumber: number): Promise<AnamnesisVersion | null> {
    return anamnesisVersionsRepo.getByVersion(supabase, anamnesisId, versionNumber)
  },
}
