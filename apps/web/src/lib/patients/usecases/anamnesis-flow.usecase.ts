import { anamnesisSteps } from '@/lib/patients/data/anamnesis-steps';
import type {
  ExtractionGuidance,
  GuidanceQuestion,
} from '@/lib/patients/services/anamnesis-guidance.service';
import type { AnamnesisFieldValue } from '@/lib/patients/types/anamnesis';

export type AnamnesisMode = 'wizard' | 'conversational';
export type AnamnesisCheckpoint = 'partial' | 'final';
export type AnamnesisPageView = 'loading' | 'privacy' | 'wizard' | 'completed' | 'locked';
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
    privacy_accepted?: boolean | null;
    terms_accepted?: boolean | null;
  } | null;
}

interface ResolveInitialStepIndexInput {
  patientBirthDate: string | null;
  completedSections?: string[] | null;
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

  if (!anamnesis?.privacy_accepted || !anamnesis?.terms_accepted) {
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
  const { patientBirthDate, completedSections } = input;
  let startIndex = 0;

  if (patientBirthDate && anamnesisSteps[0]?.id === 'edad') {
    startIndex = 1;
  }

  if (completedSections?.length) {
    const firstIncomplete = anamnesisSteps.findIndex(
      (step) => !completedSections.includes(step.id),
    );

    if (firstIncomplete > startIndex) {
      startIndex = firstIncomplete;
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
