/**
 * Conversation Integrity Guard
 *
 * Monitors the health of the clinical intake conversation.
 * Detects degradation patterns (repeated questions, meta-utterances,
 * sync failures) and computes an integrity score.
 *
 * When integrity degrades below threshold, the system should
 * switch from free-form voice to structured confirmation mode.
 */
import type { ConversationIntegrity, ClinicalCaseState } from './types';

// ─── Thresholds ────────────────────────────────────────────────────────

const REPEAT_PENALTY = 10;
const META_PENALTY = 8;
const CONFLICT_PENALTY = 5;
const HEALTHY_THRESHOLD = 80;
const DEGRADED_THRESHOLD = 50;

// ─── Recompute Integrity ───────────────────────────────────────────────

/**
 * Recompute the conversation integrity score based on current state.
 *
 * Score starts at 100 and decreases with:
 *   - Repeated prompts (bot asked something already answered): -10 each
 *   - Meta-conversational utterances (patient frustrated): -8 each
 *   - Active conflicts (contradictory data): -5 each
 */
export function recomputeIntegrity(state: ClinicalCaseState): ConversationIntegrity {
  const repeatPenalty = state.integrity.repeatPromptCount * REPEAT_PENALTY;
  const metaPenalty = state.integrity.metaUtteranceCount * META_PENALTY;
  const conflictPenalty = state.planner.conflictedFieldKeys.length * CONFLICT_PENALTY;

  const score = Math.max(0, 100 - repeatPenalty - metaPenalty - conflictPenalty);

  const degradedReasons: string[] = [];
  if (state.integrity.repeatPromptCount > 0) {
    degradedReasons.push(`repeat_prompts: ${state.integrity.repeatPromptCount}`);
  }
  if (state.integrity.metaUtteranceCount > 0) {
    degradedReasons.push(`meta_utterances: ${state.integrity.metaUtteranceCount}`);
  }
  if (state.planner.conflictedFieldKeys.length > 0) {
    degradedReasons.push(`active_conflicts: ${state.planner.conflictedFieldKeys.length}`);
  }

  return {
    stateSyncStatus:
      score >= HEALTHY_THRESHOLD
        ? 'healthy'
        : score >= DEGRADED_THRESHOLD
          ? 'degraded'
          : 'broken',
    intakeIntegrityScore: score,
    repeatPromptCount: state.integrity.repeatPromptCount,
    metaUtteranceCount: state.integrity.metaUtteranceCount,
    degradedReasons,
  };
}

// ─── Degradation Actions ───────────────────────────────────────────────

export type DegradationAction =
  | 'continue'           // score healthy, keep going
  | 'show_confirmation'  // score degraded, show structured summary for patient to confirm
  | 'force_guided_mode'  // score broken, switch to rigid step-by-step
  | 'abort_voice';       // score critical, fall back to form-only

/**
 * Determine what the system should do given the current integrity state.
 */
export function decideDegradationAction(integrity: ConversationIntegrity): DegradationAction {
  if (integrity.intakeIntegrityScore >= HEALTHY_THRESHOLD) {
    return 'continue';
  }

  if (integrity.intakeIntegrityScore >= DEGRADED_THRESHOLD) {
    return 'show_confirmation';
  }

  if (integrity.intakeIntegrityScore >= 25) {
    return 'force_guided_mode';
  }

  return 'abort_voice';
}

/**
 * Create a fresh integrity object for a new case.
 */
export function createFreshIntegrity(): ConversationIntegrity {
  return {
    stateSyncStatus: 'healthy',
    intakeIntegrityScore: 100,
    repeatPromptCount: 0,
    metaUtteranceCount: 0,
    degradedReasons: [],
  };
}

/**
 * Increment meta-utterance count.
 * Returns a new integrity object (immutable update).
 */
export function recordMetaUtterance(
  current: ConversationIntegrity,
): ConversationIntegrity {
  return {
    ...current,
    metaUtteranceCount: current.metaUtteranceCount + 1,
  };
}

/**
 * Increment repeat-prompt count.
 * Returns a new integrity object (immutable update).
 */
export function recordRepeatPrompt(
  current: ConversationIntegrity,
): ConversationIntegrity {
  return {
    ...current,
    repeatPromptCount: current.repeatPromptCount + 1,
  };
}
