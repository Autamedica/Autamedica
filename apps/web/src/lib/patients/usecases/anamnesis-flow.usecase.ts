// Pure functions module: input-to-output transforms for the anamnesis wizard flow.
// Intentionally avoids the (deps, args) DI pattern — no I/O, no Supabase, no side effects.
import { anamnesisSteps } from '@/lib/patients/data/anamnesis-steps';
import type {
  ExtractionGuidance,
  GuidanceQuestion,
} from '@/lib/patients/services/anamnesis-guidance.service';
import type { AnamnesisFieldValue } from '@/lib/patients/types/anamnesis';

export type AnamnesisMode = 'wizard' | 'conversational';
export type AnamnesisCheckpoint = 'partial' | 'final';
export type AnamnesisPageView = 'loading' | 'privacy' | 'wizard' | 'completed' | 'locked';
export type PostAnalysisAction = 'open_voice' | 'open_text' | 'finalize' | 'advance';
export type FormDataMap = Record<string, Record<string, AnamnesisFieldValue>>;

export interface AnamnesisAnalysisResult {
  coverage: string[];
  gaps: string[];
  questions: GuidanceQuestion[];
}

interface InitialFormSection {
  section: string;
  data: Record<string, unknown>;
}

interface ResolvePageViewInput {
  sessionLoading: boolean;
  anamnesisLoading: boolean;
  editMode: boolean;
  anamnesis: {
    locked?: boolean | null;
    status?: string | null;
    privacyAccepted?: boolean | null;
    termsAccepted?: boolean | null;
  } | null;
}

interface ResolveInitialStepIndexInput {
  patientBirthDate: string | null;
  completedSections?: string[] | null;
  isRevisit?: boolean;
}

interface ResolveNextWizardStepIndexInput {
  currentStepIndex: number;
  isRevisit: boolean;
  completedSections?: string[] | null;
}

interface TranscriptEntryLike {
  role: 'user' | 'assistant';
  text: string;
}

export const PARTIAL_CHECKPOINT_AFTER_STEP = 6;

export function resolvePageView(input: ResolvePageViewInput): AnamnesisPageView {
  const { sessionLoading, anamnesisLoading, editMode, anamnesis } = input;

  if (sessionLoading || anamnesisLoading) {
    return 'loading';
  }

  if (anamnesis?.locked) {
    return 'locked';
  }

  if (editMode) {
    return 'wizard';
  }

  if (anamnesis?.status === 'completed' || anamnesis?.status === 'approved') {
    return 'completed';
  }

  if (!anamnesis?.privacyAccepted || !anamnesis?.termsAccepted) {
    return 'privacy';
  }

  return 'wizard';
}

export function buildInitialFormData(
  sections: InitialFormSection[],
  patientBirthDate: string | null,
): FormDataMap {
  const saved: FormDataMap = {};

  for (const section of sections) {
    saved[section.section] = section.data as Record<string, AnamnesisFieldValue>;
  }

  if (patientBirthDate && !saved.edad?.fecha_nacimiento) {
    saved.edad = { ...saved.edad, fecha_nacimiento: patientBirthDate };
  }

  return saved;
}

export function resolveInitialStepIndex(
  input: ResolveInitialStepIndexInput,
): number {
  const { patientBirthDate, completedSections, isRevisit } = input;
  let startIndex = 0;

  if (patientBirthDate && anamnesisSteps[0]?.id === 'edad') {
    startIndex = 1;
  }

  if (completedSections?.length) {
    const firstNeedingAttention = anamnesisSteps.findIndex(
      (step, index) => {
        if (index < startIndex) return false;
        if (!completedSections.includes(step.id)) return true;

        // On revisit, stop at sections that need user confirmation
        if (isRevisit) {
          return step.mutability === 'confirm_on_revisit'
            || step.mutability === 'carry_forward_additive';
        }

        return false;
      },
    );

    if (firstNeedingAttention > startIndex) {
      startIndex = firstNeedingAttention;
    }
  }

  return startIndex;
}

export function resolveNextWizardStepIndex(
  input: ResolveNextWizardStepIndexInput,
): number {
  const { currentStepIndex, isRevisit, completedSections } = input;
  let target = currentStepIndex + 1;

  if (!isRevisit || !completedSections?.length) {
    return target;
  }

  while (
    target < anamnesisSteps.length - 1
    && anamnesisSteps[target].mutability === 'carry_forward'
    && completedSections.includes(anamnesisSteps[target].id)
  ) {
    target += 1;
  }

  return target;
}

export function validateRequiredFields(
  stepData: Record<string, AnamnesisFieldValue>,
  visibleFields: typeof anamnesisSteps[number]['fields'],
): string[] {
  return visibleFields
    .filter((field) => {
      if (!field.required) return false;
      const value = stepData[field.id];
      if (value == null || value === '') return true;
      if (Array.isArray(value) && value.length === 0) return true;
      return false;
    })
    .map((field) => field.label);
}

export function buildAnalysisResult(
  guidance: ExtractionGuidance | null,
): AnamnesisAnalysisResult {
  return {
    coverage: guidance?.coverage ?? [],
    gaps: guidance?.gaps ?? [],
    questions: guidance?.questions ?? [],
  };
}

export function hasClarificationContext(
  guidance: ExtractionGuidance | null,
): boolean {
  return Boolean(guidance && (guidance.questions.length > 0 || guidance.gaps.length > 0));
}

export function resolvePostAnalysisAction(
  checkpoint: AnamnesisCheckpoint | null,
  hasClarification: boolean,
): PostAnalysisAction {
  if (hasClarification) {
    return 'open_voice';
  }

  return checkpoint === 'final' ? 'finalize' : 'advance';
}

export function buildClarificationTurnsFromTranscript(
  transcript: TranscriptEntryLike[],
): Array<{ question: string; answer: string }> {
  const turns: Array<{ question: string; answer: string }> = [];
  let lastAssistantQuestion: string | null = null;

  for (const entry of transcript) {
    if (entry.role === 'assistant') {
      lastAssistantQuestion = entry.text.trim() || lastAssistantQuestion;
      continue;
    }

    const answer = entry.text.trim();
    if (!answer) {
      continue;
    }

    turns.push({
      question: lastAssistantQuestion ?? 'Aclaración por voz',
      answer,
    });
  }

  return turns;
}
