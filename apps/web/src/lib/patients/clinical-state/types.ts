/**
 * Clinical Case State — Core Types
 *
 * These types define the single canonical representation of a patient's
 * clinical case across all input channels (form, voice, DB, doctor review).
 *
 * RULE: No component, service, or LLM prompt should read raw transcript
 * or raw form state directly. Everything goes through this canonical state.
 */

// ─── Primitives ────────────────────────────────────────────────────────

export type UUID = string;

export type SourceType =
  | 'ui_form'
  | 'voice_transcript'
  | 'voice_extraction'
  | 'persisted_db'
  | 'doctor_review'
  | 'system_inference'
  | 'imported_document';

export type FieldStatus =
  | 'missing'
  | 'draft'
  | 'confirmed'
  | 'conflicted'
  | 'derived'
  | 'invalid'
  | 'meta_only';

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export type WorkflowType =
  | 'psychiatry_first_visit'
  | 'psychiatry_continuity'
  | 'prescription_renewal'
  | 'general_consultation'
  | 'psychiatric_urgency';

export type SegmentKey =
  | 'identity'
  | 'intake_context'
  | 'current_medication'
  | 'symptoms'
  | 'safety'
  | 'functional_impact'
  | 'history'
  | 'review';

export type QuestionIntent =
  | 'collect'
  | 'confirm'
  | 'resolve_conflict'
  | 'skip'
  | 'do_not_ask';

export type ConversationEventType =
  | 'question_presented'
  | 'answer_received'
  | 'field_updated'
  | 'field_locked'
  | 'field_conflicted'
  | 'segment_completed'
  | 'meta_conversation_detected'
  | 'planner_skipped_question';

// ─── Field Provenance ──────────────────────────────────────────────────

export interface FieldProvenance {
  source: SourceType;
  sourceEventId?: UUID;
  sourceSegment?: SegmentKey;
  rawText?: string;
  updatedAt: string; // ISO 8601
  actorId?: UUID; // patient / doctor / system
}

// ─── Canonical Field (Heart of the system) ─────────────────────────────

export interface CanonicalField<T> {
  key: string;
  value: T | null;

  status: FieldStatus;
  confidence: ConfidenceLevel;

  confirmed: boolean;
  locked: boolean;

  provenance: FieldProvenance[];

  /** Last effective write timestamp (ISO) */
  lastUpdatedAt: string;

  /** Planner signals */
  askable: boolean;
  needsConfirmation: boolean;
  conflictReason?: string;

  /** Audit trail */
  previousValue?: T | null;
}

// ─── Clinical Sections ─────────────────────────────────────────────────

export interface IdentitySection {
  firstName: CanonicalField<string>;
  lastName: CanonicalField<string>;
  fullName: CanonicalField<string>;
  age: CanonicalField<number>;
  gender: CanonicalField<string>;
  documentId: CanonicalField<string>;
}

export interface IntakeContextSection {
  workflowType: CanonicalField<WorkflowType>;
  chiefComplaint: CanonicalField<string>;
  consultationReason: CanonicalField<string>;
  continuityRequest: CanonicalField<boolean>;
  renewalRequest: CanonicalField<boolean>;
}

export interface CurrentMedicationEntry {
  medicationName: CanonicalField<string>;
  formulation: CanonicalField<string>;
  doseMgPerDay: CanonicalField<number>;
  scheduleText: CanonicalField<string>;
  adherence: CanonicalField<string>;
  subjectiveBenefit: CanonicalField<string>;
  prescriberName: CanonicalField<string>;
  prescriberKnown: CanonicalField<boolean>;
  daysRemaining: CanonicalField<number>;
}

export interface MedicationSection {
  currentMedications: CanonicalField<CurrentMedicationEntry[]>;
  hasCurrentMedication: CanonicalField<boolean>;
}

export interface SymptomSection {
  insomnia: CanonicalField<boolean>;
  appetiteChange: CanonicalField<string>;
  palpitations: CanonicalField<boolean>;
  panicEpisodes: CanonicalField<boolean>;
  chestPain: CanonicalField<boolean>;
  selfHarmIdeation: CanonicalField<boolean>;
  residualSymptoms: CanonicalField<string>;
}

export interface FunctionalImpactSection {
  workImpact: CanonicalField<string>;
  studyImpact: CanonicalField<string>;
  homeImpact: CanonicalField<string>;
  concentrationDifficulty: CanonicalField<string>;
  treatmentGoals: CanonicalField<string>;
}

// ─── Conversation Integrity ────────────────────────────────────────────

export interface ConversationIntegrity {
  stateSyncStatus: 'healthy' | 'degraded' | 'broken';
  intakeIntegrityScore: number; // 0–100
  repeatPromptCount: number;
  metaUtteranceCount: number;
  degradedReasons: string[];
}

// ─── Conversation Events ───────────────────────────────────────────────

export interface ConversationEvent {
  id: UUID;
  type: ConversationEventType;
  timestamp: string; // ISO 8601
  segment?: SegmentKey;
  fieldKey?: string;
  questionId?: UUID;
  payload?: Record<string, unknown>;
}

// ─── Full Canonical State ──────────────────────────────────────────────

export interface ClinicalCaseState {
  caseId: UUID;
  patientId: UUID;

  workflow: {
    type: WorkflowType;
    currentSegment: SegmentKey;
    completedSegments: SegmentKey[];
    openedAt: string; // ISO 8601
    updatedAt: string; // ISO 8601
  };

  identity: IdentitySection;
  intakeContext: IntakeContextSection;
  medications: MedicationSection;
  symptoms: SymptomSection;
  functionalImpact: FunctionalImpactSection;

  integrity: ConversationIntegrity;

  planner: {
    lockedFieldKeys: string[];
    missingFieldKeys: string[];
    conflictedFieldKeys: string[];
    pendingConfirmationKeys: string[];
    nextRecommendedQuestions: string[];
    doNotAskKeys: string[];
  };

  triage: {
    priority: 'routine' | 'priority' | 'urgent';
    reasons: string[];
    mandate: string;
    suggestedAction: string;
    references: string[];
    
    // Operational Monitoring
    status: 'pending' | 'acknowledged' | 'in_progress' | 'resolved' | 'escalated';
    riskOfInterruption: 'low' | 'medium' | 'high';
    requiresSameDayAction: boolean;
    resolutionDeadline?: string; // ISO
    assignedDoctorId?: UUID;
  };

  conversation: {
    lastQuestionId?: UUID;
    askedQuestionIds: UUID[];
    answeredQuestionIds: UUID[];
    lastUserUtterance?: string;
  };

  audit: {
    events: ConversationEvent[];
  };
}

// ─── IO Contracts ──────────────────────────────────────────────────────

/** A single datum arriving from any source (UI, voice, DB, etc.) */
export interface IncomingDatum<T = unknown> {
  fieldKey: string;
  value: T;
  source: SourceType;
  sourceSegment?: SegmentKey;
  confidence?: ConfidenceLevel;
  rawText?: string;
  timestamp: string; // ISO 8601
  explicitConfirmation?: boolean;
}

/** Batch of data to normalize into the canonical state */
export interface NormalizeInput {
  caseId: UUID;
  patientId: UUID;
  workflowType: WorkflowType;
  segment: SegmentKey;
  data: IncomingDatum[];
}

/** Result after normalization + merge */
export interface NormalizerResult {
  state: ClinicalCaseState;
  updatedFieldKeys: string[];
  conflictedFieldKeys: string[];
  metaConversationDetected: boolean;
  events: ConversationEvent[];
}

// ─── Planner Contracts ─────────────────────────────────────────────────

export interface PlannerQuestion {
  id: UUID;
  fieldKey: string;
  intent: QuestionIntent;
  prompt: string;
  reason: string;
}

export interface PlannerOutput {
  questions: PlannerQuestion[];
  doNotAskKeys: string[];
  skippedBecauseKnown: string[];
  blockedBecauseConflict: string[];
}

// ─── Prompt Snapshot (what the LLM actually sees) ──────────────────────

export interface PromptCaseSnapshot {
  confirmedFacts: Array<{ fieldKey: string; value: unknown; originSource: SourceType | 'system_inference'; latestSource: SourceType | 'system_inference'; confidence: ConfidenceLevel }>;
  derivedFacts: Array<{ fieldKey: string; value: unknown; originSource: SourceType | 'system_inference'; latestSource: SourceType | 'system_inference'; confidence: ConfidenceLevel }>;
  draftFacts: Array<{ fieldKey: string; value: unknown; originSource: SourceType | 'system_inference'; latestSource: SourceType | 'system_inference'; confidence: ConfidenceLevel }>;
  
  priorityMissingFacts: string[];
  safetyCriticalFacts: string[];
  nextBestQuestionKeys: string[];
  
  conflictedFacts: string[];
  lockedFacts: string[];
  doNotAskFacts: string[];
  workflowType: WorkflowType;
  currentSegment: SegmentKey;
  integrityStatus: 'healthy' | 'degraded' | 'broken';
}
