/**
 * CanonicalField<T> — Factory & helpers
 *
 * Creates empty fields and provides utilities for inspecting field state.
 */
import type {
  CanonicalField,
  ConfidenceLevel,
  SegmentKey,
  SourceType,
} from './types';

// ─── Factory ───────────────────────────────────────────────────────────

export function createEmptyField<T>(key: string): CanonicalField<T> {
  return {
    key,
    value: null,
    status: 'missing',
    confidence: 'low',
    confirmed: false,
    locked: false,
    provenance: [],
    lastUpdatedAt: new Date().toISOString(),
    askable: true,
    needsConfirmation: false,
  };
}

export function createConfirmedField<T>(
  key: string,
  value: T,
  source: SourceType,
  segment?: SegmentKey,
): CanonicalField<T> {
  const now = new Date().toISOString();
  return {
    key,
    value,
    status: 'confirmed',
    confidence: 'high',
    confirmed: true,
    locked: true,
    provenance: [{
      source,
      sourceSegment: segment,
      updatedAt: now,
    }],
    lastUpdatedAt: now,
    askable: false,
    needsConfirmation: false,
  };
}

export function createDraftField<T>(
  key: string,
  value: T,
  source: SourceType,
  confidence: ConfidenceLevel = 'medium',
  segment?: SegmentKey,
): CanonicalField<T> {
  const now = new Date().toISOString();
  return {
    key,
    value,
    status: 'draft',
    confidence,
    confirmed: false,
    locked: false,
    provenance: [{
      source,
      sourceSegment: segment,
      updatedAt: now,
    }],
    lastUpdatedAt: now,
    askable: confidence !== 'high',
    needsConfirmation: confidence !== 'high',
  };
}

// ─── Inspection helpers ────────────────────────────────────────────────

export function isFieldResolved<T>(field: CanonicalField<T>): boolean {
  return (
    field.value !== null &&
    field.value !== undefined &&
    field.status !== 'missing' &&
    field.status !== 'invalid' &&
    field.status !== 'meta_only'
  );
}

export function isFieldAskable<T>(field: CanonicalField<T>): boolean {
  if (field.locked && field.status === 'confirmed') return false;
  if (field.status === 'missing') return true;
  if (field.status === 'conflicted') return true;
  if (field.needsConfirmation) return true;
  if (field.confidence === 'low') return true;
  return false;
}

export function fieldNeedsReconfirmation<T>(field: CanonicalField<T>): boolean {
  return (
    field.status === 'conflicted' ||
    (field.value !== null && field.confidence === 'low') ||
    field.needsConfirmation
  );
}

/**
 * Set a field to conflicted state, preserving the old value for audit
 */
export function markConflicted<T>(
  field: CanonicalField<T>,
  reason: string,
): CanonicalField<T> {
  return {
    ...field,
    status: 'conflicted',
    locked: false,
    askable: true,
    needsConfirmation: true,
    conflictReason: reason,
  };
}

/**
 * Lock a confirmed field so the planner won't re-ask
 */
export function lockField<T>(field: CanonicalField<T>): CanonicalField<T> {
  return {
    ...field,
    locked: true,
    askable: false,
    needsConfirmation: false,
    status: 'confirmed',
  };
}

/**
 * Flatten all CanonicalField instances from any section object.
 * Traverses one level deep into the section to collect fields.
 */
export function flattenSectionFields(
  section: Record<string, unknown>,
): CanonicalField<unknown>[] {
  const fields: CanonicalField<unknown>[] = [];
  for (const val of Object.values(section)) {
    if (isCanonicalField(val)) {
      fields.push(val);
    }
  }
  return fields;
}

function isCanonicalField(val: unknown): val is CanonicalField<unknown> {
  if (!val || typeof val !== 'object') return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.key === 'string' &&
    'status' in obj &&
    'confidence' in obj &&
    'provenance' in obj &&
    Array.isArray(obj.provenance)
  );
}

/**
 * Flatten ALL clinical fields from the entire ClinicalCaseState.
 * Accepts any object with section properties (identity, intakeContext, etc.).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function flattenAllFields(state: any): CanonicalField<unknown>[] {
  const sections = ['identity', 'intakeContext', 'medications', 'symptoms', 'functionalImpact', 'history', 'review'] as const;
  const fields: CanonicalField<unknown>[] = [];
  for (const key of sections) {
    const section = state[key];
    if (section && typeof section === 'object') {
      fields.push(...flattenSectionFields(section as Record<string, unknown>));
    }
  }
  return fields;
}
