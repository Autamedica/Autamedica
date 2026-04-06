import { createAstroAdminClient } from '@/lib/supabase';

export type GeminiLiveCheckpoint = 'partial' | 'final';
export type GeminiLiveSessionMode = 'general' | 'guided_checkpoint';

export interface GeminiLivePatientContext {
  name: string | null;
  age: number | null;
  completedSections: string[];
  /** Key clinical data from completed sections — feeds the system instruction */
  sectionData: Record<string, Record<string, unknown>>;
}

export interface GeminiLiveSessionConfig {
  mode: GeminiLiveSessionMode;
  checkpoint?: GeminiLiveCheckpoint;
  patient: GeminiLivePatientContext;
  guidanceQuestions: string[];
  coverageGaps: string[];
  coverageSummary?: string;
  maxModelTurns: number;
}

interface BuildGeminiLiveSessionConfigInput {
  userId: string;
  patientId: string;
  checkpoint?: GeminiLiveCheckpoint;
  guidanceQuestions?: string[];
  coverageGaps?: string[];
  coverageSummary?: string;
  runtimeEnv?: Record<string, unknown> | null;
}

function sanitizeList(values?: string[]): string[] {
  if (!values?.length) {
    return [];
  }

  return values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function sanitizeSummary(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, 500);
}

function calculateAge(birthDate: string | null | undefined): number | null {
  if (!birthDate) {
    return null;
  }

  const parsed = new Date(birthDate);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return Math.floor((Date.now() - parsed.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

async function fetchPatientContext(
  userId: string,
  patientId: string,
  runtimeEnv?: Record<string, unknown> | null,
): Promise<GeminiLivePatientContext> {
  const admin = createAstroAdminClient(runtimeEnv);

  const [profileRes, patientRes, anamnesisRes] = await Promise.all([
    admin
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', userId)
      .maybeSingle(),
    admin
      .from('patients')
      .select('birth_date')
      .eq('id', patientId)
      .maybeSingle(),
    admin
      .from('anamnesis')
      .select('id')
      .eq('patient_id', patientId)
      .maybeSingle(),
  ]);

  let completedSections: string[] = [];
  const sectionData: Record<string, Record<string, unknown>> = {};
  if (anamnesisRes.data?.id) {
    const { data: sections } = await admin
      .from('anamnesis_sections')
      .select('section, data')
      .eq('anamnesis_id', anamnesisRes.data.id)
      .eq('completed', true);
    completedSections = sections?.map((section) => section.section) ?? [];
    for (const section of sections ?? []) {
      if (section.data && typeof section.data === 'object') {
        sectionData[section.section] = section.data as Record<string, unknown>;
      }
    }
  }

  const firstName = profileRes.data?.first_name?.trim() ?? '';
  const lastName = profileRes.data?.last_name?.trim() ?? '';

  return {
    name: [firstName, lastName].filter(Boolean).join(' ') || null,
    age: calculateAge(patientRes.data?.birth_date),
    completedSections,
    sectionData,
  };
}

export async function buildGeminiLiveSessionConfig(
  input: BuildGeminiLiveSessionConfigInput,
): Promise<GeminiLiveSessionConfig> {
  const guidanceQuestions = sanitizeList(input.guidanceQuestions);
  const coverageGaps = sanitizeList(input.coverageGaps);
  const coverageSummary = sanitizeSummary(input.coverageSummary);
  const patient = await fetchPatientContext(input.userId, input.patientId, input.runtimeEnv);
  const guidedCheckpoint = Boolean(
    input.checkpoint || guidanceQuestions.length > 0 || coverageGaps.length > 0,
  );

  return {
    mode: guidedCheckpoint ? 'guided_checkpoint' : 'general',
    checkpoint: guidedCheckpoint ? input.checkpoint : undefined,
    patient,
    guidanceQuestions,
    coverageGaps,
    coverageSummary,
    maxModelTurns: guidedCheckpoint ? 4 : 8,
  };
}
