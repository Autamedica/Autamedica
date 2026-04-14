'use client'

/**
 * ClinicalFieldWrapper — Smart wrapper for intake form fields.
 *
 * Reads the CanonicalField state for a given fieldId and adapts rendering:
 * - capture: normal input (pass-through to children)
 * - confirm: shows existing value with [Confirmar] / [Editar]
 * - conflict: shows both values for user to pick
 * - locked: read-only display with ✓ badge
 */
import { useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, PenLine } from 'lucide-react'
import type { CanonicalField } from '@/lib/patients/clinical-state/types'
import {
  resolveFieldUXState,
  sourceLabel,
  getStatusBadgeClasses,
  type FieldUXState,
} from '@/lib/patients/clinical-state/field-ux-state'
import type { AnamnesisFieldValue } from '@/lib/patients/types/anamnesis'

interface ClinicalFieldWrapperProps {
  /** The canonical field from the clinical state */
  canonicalField?: CanonicalField<unknown> | null
  /** Current form value */
  formValue: AnamnesisFieldValue
  /** Field label for display */
  label: string
  /** Called when user confirms the existing value */
  onConfirm: (value: AnamnesisFieldValue) => void
  /** Called when user selects a value during conflict resolution */
  onResolve: (value: AnamnesisFieldValue) => void
  /** Normal field input (rendered in capture/edit mode) */
  children: React.ReactNode
}

export function ClinicalFieldWrapper({
  canonicalField,
  formValue,
  label,
  onConfirm,
  onResolve,
  children,
}: ClinicalFieldWrapperProps) {
  const uxState = resolveFieldUXState(canonicalField)
  const [editMode, setEditMode] = useState(false)
  const latestSource = canonicalField?.provenance[canonicalField.provenance.length - 1]?.source
  const isLocalUiDraft = canonicalField?.status === 'draft' && latestSource === 'ui_form'

  // Edit mode overrides everything
  if (editMode) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <StatusBadge state={uxState} />
          <button
            type="button"
            onClick={() => setEditMode(false)}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Cancelar edición
          </button>
        </div>
        {children}
      </div>
    )
  }

  // Keep the raw field visible while the value is still only a local UI draft.
  if (uxState.mode === 'capture' || !canonicalField || isLocalUiDraft) {
    return <>{children}</>
  }

  // Confirmed / Locked → read-only display
  if (uxState.mode === 'locked') {
    return (
      <LockedFieldDisplay
        label={label}
        value={uxState.currentValue}
        source={uxState.source}
        onEdit={() => setEditMode(true)}
      />
    )
  }

  // Needs confirmation → show value + confirm/edit buttons
  if (uxState.mode === 'confirm') {
    return (
      <ConfirmFieldDisplay
        label={label}
        value={uxState.currentValue}
        formValue={formValue}
        source={uxState.source}
        onConfirm={() => onConfirm(uxState.currentValue as AnamnesisFieldValue)}
        onEdit={() => setEditMode(true)}
      />
    )
  }

  // Conflict → show both values for resolution
  if (uxState.mode === 'conflict') {
    return (
      <ConflictFieldDisplay
        label={label}
        currentValue={uxState.currentValue}
        previousValue={uxState.previousValue}
        reason={uxState.conflictReason ?? ''}
        onResolveCurrent={() => onResolve(uxState.currentValue as AnamnesisFieldValue)}
        onResolvePrevious={() => onResolve(uxState.previousValue as AnamnesisFieldValue)}
        onEdit={() => setEditMode(true)}
      />
    )
  }

  return <>{children}</>
}

// ─── Sub-components ────────────────────────────────────────────────────

function StatusBadge({ state }: { state: FieldUXState }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${getStatusBadgeClasses(state.statusColor)}`}>
      {state.statusColor === 'green' && <CheckCircle2 className="h-3 w-3" />}
      {state.statusColor === 'red' && <AlertTriangle className="h-3 w-3" />}
      {state.statusLabel}
    </span>
  )
}

function LockedFieldDisplay({
  label: _label,
  value,
  source,
  onEdit,
}: {
  label: string
  value: unknown
  source?: string
  onEdit: () => void
}) {
  return (
    <motion.div
      className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">
              Confirmado
            </span>
            {source && (
              <span className="text-[10px] text-emerald-500/70">
                vía {sourceLabel(source)}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-slate-800 leading-relaxed">
            {formatDisplayValue(value)}
          </p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-all"
          title="Editar"
        >
          <PenLine className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  )
}

function ConfirmFieldDisplay({
  label: _label,
  value,
  formValue: _formValue,
  source,
  onConfirm,
  onEdit,
}: {
  label: string
  value: unknown
  formValue: AnamnesisFieldValue
  source?: string
  onConfirm: () => void
  onEdit: () => void
}) {
  return (
    <motion.div
      className="rounded-xl border border-amber-100 bg-amber-50/40 p-4 space-y-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
          Por confirmar
        </span>
        {source && (
          <span className="text-[10px] text-amber-500/70">
            registrado vía {sourceLabel(source)}
          </span>
        )}
      </div>

      <p className="text-sm text-slate-700 leading-relaxed">
        Tenemos registrado: <strong className="text-slate-900">{formatDisplayValue(value)}</strong>
      </p>
      <p className="text-xs text-slate-500">¿Sigue siendo correcto?</p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-600 transition-all active:scale-[0.97]"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Confirmar
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 hover:border-slate-300 hover:shadow-sm transition-all active:scale-[0.97]"
        >
          <PenLine className="h-3.5 w-3.5" />
          Editar
        </button>
      </div>
    </motion.div>
  )
}

function ConflictFieldDisplay({
  label: _label,
  currentValue,
  previousValue,
  reason,
  onResolveCurrent,
  onResolvePrevious,
  onEdit,
}: {
  label: string
  currentValue: unknown
  previousValue: unknown
  reason: string
  onResolveCurrent: () => void
  onResolvePrevious: () => void
  onEdit: () => void
}) {
  return (
    <motion.div
      className="rounded-xl border border-red-100 bg-red-50/40 p-4 space-y-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-500" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-red-600">
          Requiere revisión
        </span>
      </div>

      <p className="text-sm text-slate-700 leading-relaxed">
        {reason || 'Registramos dos versiones distintas. Ayudanos a confirmar cuál es la correcta.'}
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onResolveCurrent}
          className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-sky-300 hover:shadow-sm transition-all group"
        >
          <div className="h-4 w-4 rounded-full mt-0.5 border-2 border-slate-300 group-hover:border-sky-500 transition-colors shrink-0" />
          <div>
            <p className="text-xs font-semibold text-slate-700">{formatDisplayValue(currentValue)}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Versión más reciente</p>
          </div>
        </button>

        {previousValue !== undefined && previousValue !== null && (
          <button
            type="button"
            onClick={onResolvePrevious}
            className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-sky-300 hover:shadow-sm transition-all group"
          >
            <div className="h-4 w-4 rounded-full mt-0.5 border-2 border-slate-300 group-hover:border-sky-500 transition-colors shrink-0" />
            <div>
              <p className="text-xs font-semibold text-slate-700">{formatDisplayValue(previousValue)}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Versión anterior</p>
            </div>
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onEdit}
        className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
      >
        <PenLine className="h-3 w-3" />
        Escribir un valor diferente
      </button>
    </motion.div>
  )
}

// ─── Utility ───────────────────────────────────────────────────────────

function formatDisplayValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Sí' : 'No'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') {
    // Truncate long values
    return value.length > 200 ? `${value.slice(0, 200)}…` : value
  }
  if (Array.isArray(value)) {
    return value.map(formatDisplayValue).join(', ')
  }
  return JSON.stringify(value)
}
