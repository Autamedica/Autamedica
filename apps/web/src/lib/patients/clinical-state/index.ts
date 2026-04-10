/**
 * Clinical Case State — Barrel Export
 *
 * Single import point for the entire clinical state system.
 *
 * Usage:
 *   import {
 *     createEmptyState,
 *     normalize,
 *     normalizeFormData,
 *     normalizeVoiceExtraction,
 *     planQuestions,
 *     buildPromptSnapshot,
 *     buildPromptText,
 *     isMetaConversational,
 *     recomputeIntegrity,
 *     decideDegradationAction,
 *   } from '@/lib/patients/clinical-state';
 */

// Types
export type {
  UUID,
  SourceType,
  FieldStatus,
  ConfidenceLevel,
  WorkflowType,
  SegmentKey,
  QuestionIntent,
  ConversationEventType,
  FieldProvenance,
  CanonicalField,
  IdentitySection,
  IntakeContextSection,
  CurrentMedicationEntry,
  MedicationSection,
  SymptomSection,
  FunctionalImpactSection,
  ConversationIntegrity,
  ConversationEvent,
  ClinicalCaseState,
  IncomingDatum,
  NormalizeInput,
  NormalizerResult,
  PlannerQuestion,
  PlannerOutput,
  PromptCaseSnapshot,
} from './types';

// Canonical Field
export {
  createEmptyField,
  createConfirmedField,
  createDraftField,
  isFieldResolved,
  isFieldAskable,
  fieldNeedsReconfirmation,
  markConflicted,
  lockField,
  flattenSectionFields,
  flattenAllFields,
} from './canonical-field';

// Meta-Conversational Filter
export {
  isMetaConversational,
  analyzeMetaContent,
  stripMetaFragments,
} from './meta-filter';

// Precedence Engine
export {
  precedenceScore,
  fieldPrecedenceScore,
  shouldMarkConflict,
  shouldOverwrite,
} from './precedence';

// Merge Engine
export {
  mergeField,
  batchMerge,
} from './merge-engine';
export type { MergeResult, BatchMergeResult } from './merge-engine';

// Integrity
export {
  recomputeIntegrity,
  decideDegradationAction,
  createFreshIntegrity,
  recordMetaUtterance,
  recordRepeatPrompt,
} from './integrity';
export type { DegradationAction } from './integrity';

// Question Planner
export { planQuestions } from './question-planner';

// Prompt Snapshot
export { buildPromptSnapshot, buildPromptText } from './prompt-snapshot';

// Normalizer
export {
  createEmptyState,
  normalize,
  normalizeFormData,
  normalizeVoiceExtraction,
  resolveCanonicalKey,
  reverseCanonicalKey,
} from './normalizer';
