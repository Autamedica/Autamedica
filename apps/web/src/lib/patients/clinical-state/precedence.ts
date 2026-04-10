/**
 * Precedence Engine
 *
 * Determines which datum wins when two values compete for the same field.
 *
 * The precedence hierarchy (highest to lowest):
 *   1. Explicit patient correction  (+100)
 *   2. Doctor review                (+90)
 *   3. UI form (typed explicitly)   (+70)
 *   4. Voice extraction (model)     (+55)
 *   5. Persisted DB (historical)    (+40)
 *   6. System inference             (+20)
 *   7. Raw voice transcript         (+10)
 *   8. Imported document            (+10)
 *
 * Within the same source tier, confidence level breaks ties:
 *   - high:   +15
 *   - medium: +8
 *   - low:    +0
 */
import type {
  CanonicalField,
  ConfidenceLevel,
  IncomingDatum,
  SourceType,
} from './types';

// ─── Score Calculation ─────────────────────────────────────────────────

const SOURCE_WEIGHTS: Record<SourceType, number> = {
  doctor_review: 90,
  ui_form: 70,
  voice_extraction: 55,
  persisted_db: 40,
  system_inference: 20,
  voice_transcript: 10,
  imported_document: 10,
};

const CONFIDENCE_WEIGHTS: Record<ConfidenceLevel, number> = {
  high: 15,
  medium: 8,
  low: 0,
};

/**
 * Compute precedence score for an incoming datum.
 * Higher score = stronger claim to the field.
 */
export function precedenceScore(input: IncomingDatum): number {
  let score = 0;

  // Explicit confirmation (patient said "sí, eso es correcto") dominates
  if (input.explicitConfirmation) score += 100;

  score += SOURCE_WEIGHTS[input.source] ?? 10;
  score += CONFIDENCE_WEIGHTS[input.confidence ?? 'low'];

  return score;
}

/**
 * Compute precedence score for an existing canonical field.
 */
export function fieldPrecedenceScore<T>(field: CanonicalField<T>): number {
  let score = 0;

  if (field.confirmed) score += 100;

  // Use the most recent provenance as the representative source
  const latestProvenance = field.provenance[field.provenance.length - 1];
  if (latestProvenance) {
    score += SOURCE_WEIGHTS[latestProvenance.source] ?? 10;
  }

  score += CONFIDENCE_WEIGHTS[field.confidence];

  return score;
}

// ─── Conflict Detection ────────────────────────────────────────────────

/**
 * Determine whether an incoming datum should trigger a CONFLICT
 * rather than a simple overwrite.
 *
 * Conflict = both the existing and incoming values are strong enough
 * that we can't silently discard either. Needs human resolution.
 */
export function shouldMarkConflict<T>(
  current: CanonicalField<T>,
  incoming: IncomingDatum<T>,
): boolean {
  // Nothing to conflict with
  if (current.value == null) return false;
  if (incoming.value == null) return false;

  // Same value → no conflict
  if (valuesAreEquivalent(current.value, incoming.value)) return false;

  // Both are strong → conflict
  const currentStrong =
    current.confirmed || current.confidence === 'high';
  const incomingStrong =
    incoming.explicitConfirmation === true || incoming.confidence === 'high';

  return currentStrong && incomingStrong;
}

/**
 * Whether the incoming datum should overwrite the existing field
 * (without triggering a conflict).
 */
export function shouldOverwrite<T>(
  current: CanonicalField<T>,
  incoming: IncomingDatum<T>,
): boolean {
  // Empty field → always accept
  if (current.value == null || current.status === 'missing') return true;

  // Same value → update metadata only
  if (valuesAreEquivalent(current.value, incoming.value)) return true;

  // Locked field → only if incoming has explicit correction or doctor review
  if (current.locked) {
    return (
      incoming.explicitConfirmation === true ||
      incoming.source === 'doctor_review'
    );
  }

  // Compare precedence scores
  return precedenceScore(incoming) >= fieldPrecedenceScore(current);
}

// ─── Value Comparison ──────────────────────────────────────────────────

/**
 * Compare two values for clinical equivalence.
 * Handles strings case-insensitively and trims whitespace.
 */
function valuesAreEquivalent<T>(a: T, b: T): boolean {
  if (a === b) return true;

  if (typeof a === 'string' && typeof b === 'string') {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }

  // For objects/arrays, do JSON comparison
  if (typeof a === 'object' && typeof b === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }

  return false;
}
