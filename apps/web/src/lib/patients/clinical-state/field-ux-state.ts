/**
 * ClinicalFieldStatus — UX state resolver for CanonicalField
 *
 * Translates the internal field status into UX-friendly states
 * that drive rendering modes in the intake form.
 */
import type { CanonicalField, FieldStatus } from '@/lib/patients/clinical-state/types'

// ─── UX Field Mode ─────────────────────────────────────────────────────

/**
 * The 4 UX modes a field can be in:
 * - capture: no data yet, show normal input
 * - confirm: data exists, show value + [Confirmar] / [Editar]
 * - conflict: two sources disagree, show both options
 * - locked: confirmed and locked, show read-only with check
 */
export type FieldUXMode = 'capture' | 'confirm' | 'conflict' | 'locked'

export interface FieldUXState {
  mode: FieldUXMode
  /** Current best value (if any) */
  currentValue: unknown
  /** Previous value (for conflict resolution) */
  previousValue?: unknown
  /** Human-readable reason for conflict */
  conflictReason?: string
  /** Source that provided the current value */
  source?: string
  /** Whether the user should see a confirmation prompt */
  showConfirmation: boolean
  /** Visual indicator class */
  statusColor: 'green' | 'amber' | 'red' | 'slate'
  /** Short status label for the badge */
  statusLabel: string
}

// ─── Resolver ──────────────────────────────────────────────────────────

export function resolveFieldUXState(field: CanonicalField<unknown> | undefined | null): FieldUXState {
  // No canonical field → pure capture mode
  if (!field || field.status === 'missing') {
    return {
      mode: 'capture',
      currentValue: null,
      showConfirmation: false,
      statusColor: 'slate',
      statusLabel: 'Pendiente',
    }
  }

  // Conflicted → show both values
  if (field.status === 'conflicted') {
    return {
      mode: 'conflict',
      currentValue: field.value,
      previousValue: field.previousValue,
      conflictReason: field.conflictReason ?? 'Datos diferentes entre fuentes',
      source: field.provenance[field.provenance.length - 1]?.source,
      showConfirmation: true,
      statusColor: 'red',
      statusLabel: 'Requiere revisión',
    }
  }

  // Confirmed and locked → read-only
  if (field.locked && field.confirmed) {
    return {
      mode: 'locked',
      currentValue: field.value,
      source: field.provenance[field.provenance.length - 1]?.source,
      showConfirmation: false,
      statusColor: 'green',
      statusLabel: 'Confirmado',
    }
  }

  // Has value but needs confirmation (draft, low confidence, etc.)
  if (field.value !== null && (field.needsConfirmation || field.confidence !== 'high' || field.status === 'draft')) {
    return {
      mode: 'confirm',
      currentValue: field.value,
      source: field.provenance[field.provenance.length - 1]?.source,
      showConfirmation: true,
      statusColor: 'amber',
      statusLabel: 'Por confirmar',
    }
  }

  // Has value, is confirmed
  if (field.value !== null && field.confirmed) {
    return {
      mode: 'locked',
      currentValue: field.value,
      showConfirmation: false,
      statusColor: 'green',
      statusLabel: 'Completado',
    }
  }

  // Fallback: has value but unknown status
  if (field.value !== null) {
    return {
      mode: 'confirm',
      currentValue: field.value,
      showConfirmation: false,
      statusColor: 'amber',
      statusLabel: 'Registrado',
    }
  }

  // Default: capture
  return {
    mode: 'capture',
    currentValue: null,
    showConfirmation: false,
    statusColor: 'slate',
    statusLabel: 'Pendiente',
  }
}

// ─── Source label ───────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  form: 'formulario',
  voice: 'voz',
  db: 'sistema',
  doctor: 'profesional',
  llm_extraction: 'IA',
}

export function sourceLabel(source?: string): string {
  if (!source) return ''
  return SOURCE_LABELS[source] ?? source
}

// ─── Status badge helper ───────────────────────────────────────────────

const STATUS_BADGE_CLASSES: Record<FieldUXState['statusColor'], string> = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  slate: 'bg-slate-50 text-slate-500 border-slate-200',
}

export function getStatusBadgeClasses(color: FieldUXState['statusColor']): string {
  return STATUS_BADGE_CLASSES[color] ?? STATUS_BADGE_CLASSES.slate
}

// ─── Step-level summary ────────────────────────────────────────────────

export interface StepFieldSummary {
  total: number
  completed: number
  pending: number
  conflicts: number
  needsConfirmation: number
}

export function summarizeStepFields(fields: CanonicalField<unknown>[]): StepFieldSummary {
  const summary: StepFieldSummary = {
    total: fields.length,
    completed: 0,
    pending: 0,
    conflicts: 0,
    needsConfirmation: 0,
  }

  for (const field of fields) {
    const ux = resolveFieldUXState(field)
    switch (ux.mode) {
      case 'locked':
        summary.completed++
        break
      case 'conflict':
        summary.conflicts++
        break
      case 'confirm':
        summary.needsConfirmation++
        break
      case 'capture':
        summary.pending++
        break
    }
  }

  return summary
}
