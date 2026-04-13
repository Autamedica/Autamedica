import {
  psychiatryPhaseMeta,
  psychiatryPhaseOrder,
} from '@/lib/patients/data/psychiatry-intake-steps'
import type { AnamnesisFieldValue } from '@/lib/patients/types/anamnesis'
import type {
  PsychiatryFormData,
  PsychiatryIntakePhase,
} from '@/lib/patients/types/psychiatry-intake'
import type { SegmentKey, WorkflowType } from '@/lib/patients/clinical-state/types'

/** Canonical mapping from intake step IDs to clinical state segment keys. Single source of truth. */
export const STEP_TO_SEGMENT: Record<string, SegmentKey> = {
  // Identity
  contexto_personal: 'identity',
  datos_demograficos: 'identity',
  // Intake context
  consulta_actual: 'intake_context',
  motivo_consulta: 'intake_context',
  // Medication
  medicacion_actual: 'current_medication',
  medicacion: 'current_medication',
  monitoreo_tratamiento: 'current_medication',
  // Symptoms
  sintomas_actuales: 'symptoms',
  sintomas: 'symptoms',
  historia_sintomas: 'symptoms',
  // Safety
  seguridad: 'safety',
  seguridad_clinica: 'safety',
  contraindicaciones_medicas: 'safety',
  // Functional impact
  impacto_funcional: 'functional_impact',
  objetivos_terapeuticos: 'functional_impact',
  // History
  historial: 'history',
  diagnostico_y_tratamiento: 'history',
  respuesta_previa: 'history',
  antecedentes_mentales: 'history',
  // Review / closure
  cierre_clinico: 'review',
  relato_clinico: 'review',
  aclaraciones_finales: 'review',
}

export type StepStatus = 'locked' | 'conflict' | 'confirm' | 'pending'

/** Build keyed formData from raw section records + patient birth date. */
export function buildFormData(
  sections: Array<{ section: string; data: Record<string, unknown> }>,
  patientBirthDate: string | null,
): PsychiatryFormData {
  const saved: PsychiatryFormData = {}
  for (const section of sections) {
    saved[section.section] = section.data as Record<string, AnamnesisFieldValue>
  }

  if (patientBirthDate && !saved.contexto_personal?.fecha_nacimiento) {
    saved.contexto_personal = {
      ...saved.contexto_personal,
      fecha_nacimiento: patientBirthDate,
    }
  }

  return saved
}

/** Compute the resume position (phaseIndex + stepIndex) from completed sections. */
export function getPhaseStart(
  completedSections: string[] | undefined,
  lastPhase: PsychiatryIntakePhase | null | undefined,
): { phaseIndex: number; stepIndex: number } {
  const completed = new Set(completedSections ?? [])

  for (let phaseIndex = 0; phaseIndex < psychiatryPhaseOrder.length; phaseIndex += 1) {
    const phaseId = psychiatryPhaseOrder[phaseIndex]
    if (phaseId === 'completed') {
      continue
    }

    const phase = psychiatryPhaseMeta[phaseId]
    const steps = phase.steps
    const firstPendingIndex = steps.findIndex((step: { id: string }) => !completed.has(step.id))
    if (firstPendingIndex >= 0) {
      return { phaseIndex, stepIndex: firstPendingIndex }
    }
  }

  if (lastPhase && lastPhase !== 'completed') {
    const phaseIndex = psychiatryPhaseOrder.indexOf(lastPhase)
    if (phaseIndex >= 0) {
      return { phaseIndex, stepIndex: 0 }
    }
  }

  return { phaseIndex: psychiatryPhaseOrder.indexOf('completed'), stepIndex: 0 }
}

/** Derive the workflow type from the consultation type field in formData. */
export function resolveWorkflowType(formData: PsychiatryFormData): WorkflowType {
  const tipoAtencion = formData?.consulta_actual?.tipo_atencion
  if (tipoAtencion === 'continuidad') return 'psychiatry_continuity'
  if (tipoAtencion === 'revision_urgente') return 'psychiatric_urgency'
  if (tipoAtencion === 'primera_consulta') return 'psychiatry_first_visit'
  return 'general_consultation'
}

/** Compute the UX status for each step in a phase using the canonical field state. */
export function deriveStepStatuses(
  steps: ReadonlyArray<{ id: string; fields?: Array<{ id: string }>; field?: { id: string } }>,
  getFieldUiState: (fieldId: string, stepId: string) => { mode: string },
): StepStatus[] {
  return steps.map((step) => {
    const fieldIds = step.field
      ? [step.field.id]
      : (step.fields ?? []).map((f) => f.id)

    if (fieldIds.length === 0) return 'pending'

    let allLocked = true
    let hasConflict = false
    let hasConfirm = false

    for (const fid of fieldIds) {
      const uxState = getFieldUiState(fid, step.id)

      if (uxState.mode === 'conflict') {
        hasConflict = true
        allLocked = false
      } else if (uxState.mode === 'confirm') {
        hasConfirm = true
        allLocked = false
      } else if (uxState.mode !== 'locked') {
        allLocked = false
      }
    }

    if (hasConflict) return 'conflict'
    if (allLocked) return 'locked'
    if (hasConfirm) return 'confirm'
    return 'pending'
  })
}

/** Filter visible fields based on dependency rules. */
export function computeVisibleFields<
  F extends { id: string; dependsOn?: { fieldId: string; value: unknown } | null },
>(
  fields: F[],
  currentStepData: Record<string, AnamnesisFieldValue>,
): F[] {
  return fields.filter((field) => {
    if (!field.dependsOn) return true
    const depValue = field.dependsOn.value
    const actualValue = currentStepData[field.dependsOn.fieldId]
    if (Array.isArray(depValue)) {
      return depValue.some((v) => v === actualValue)
    }
    return actualValue === depValue
  })
}
