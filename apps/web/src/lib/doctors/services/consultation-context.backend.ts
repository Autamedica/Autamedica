/**
 * Backend Service: Consultation Context Retrieval
 * Fetches anamnesis, extraction, and AI-derived clinical context for doctor decision support.
 * Layer 6 of 7-layer architecture.
 */
import { createAstroAdminClient } from '@/lib/supabase';
import { buildAnamnesisSummary, logger } from '@autamedica/shared';
import {
  buildAnamnesisExtractionRequest,
  executeAnamnesisExtraction,
  isAnamnesisExtractionConfigured,
  ANAMNESIS_EXTRACTION_PROMPT_VERSION,
} from '@/lib/patients/server/anamnesis-ai-extraction';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@autamedica/types';
import { createHash } from 'node:crypto';

type AdminClient = SupabaseClient;

interface AnamnesisRecord {
  id: string;
  status: string;
  privacy_accepted: boolean | null;
  completion_percentage: number | null;
}

interface SectionRecord {
  section: string;
  data: Json;
  completed: boolean | null;
  updated_at: string | null;
}

interface ExtractionCacheRecord {
  extraction_result: unknown;
  provider_name: string;
  model_name: string;
  prompt_version: string;
}

interface PatientProfile {
  name: string;
  dateOfBirth: string | null;
  gender: string | null;
}

/**
 * Compute SHA256 hash of anamnesis sections for cache validation.
 */
function computeSectionsHash(sections: SectionRecord[]): string {
  const content = sections
    .map(s => `${s.section}:${JSON.stringify(s.data)}`)
    .sort()
    .join('|');
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Get or create AI extraction of anamnesis sections.
 * Checks cache first; if miss, executes extraction and caches result.
 */
async function getOrCreateExtraction(
  admin: AdminClient,
  anamnesisId: string,
  patientId: string,
  patientLabel: string,
  anamnesisStatus: string,
  sections: SectionRecord[],
): Promise<{ extraction: unknown; fromCache: boolean } | null> {
  if (!isAnamnesisExtractionConfigured()) {
    return null;
  }

  const sectionsHash = computeSectionsHash(sections);

  // Check cache
  const { data: cached } = await admin
    .from('anamnesis_extractions')
    .select('extraction_result, provider_name, model_name, prompt_version')
    .eq('anamnesis_id', anamnesisId)
    .eq('source_sections_hash', sectionsHash)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached) {
    const cacheRecord = cached as ExtractionCacheRecord;
    return { extraction: cacheRecord.extraction_result, fromCache: true };
  }

  // Execute new extraction
  try {
    const request = buildAnamnesisExtractionRequest({
      patientId,
      patientLabel,
      anamnesisStatus,
      privacyAccepted: true,
      sections,
    });

    const { result, providerName, modelName } = await executeAnamnesisExtraction(request);

    // Cache the result
    await admin.from('anamnesis_extractions').upsert(
      {
        anamnesis_id: anamnesisId,
        patient_id: patientId,
        provider_name: providerName,
        model_name: modelName,
        prompt_version: ANAMNESIS_EXTRACTION_PROMPT_VERSION,
        extraction_result: result as unknown as Record<string, unknown>,
        source_sections_hash: sectionsHash,
      },
      { onConflict: 'anamnesis_id,source_sections_hash' },
    );

    return { extraction: result, fromCache: false };
  } catch (err) {
    logger.error('[consultation-context] AI extraction failed', err);
    return null;
  }
}

/**
 * Fetch consultation context (anamnesis, extraction, red flags, suggested questions).
 * Returns empty context if room has no participants or anamnesis not shared.
 */
export async function getConsultationContext(roomId: string, patientId: string, patientProfile: PatientProfile): Promise<{
  hasAnamnesis: boolean;
  patient: PatientProfile | null;
  anamnesisStatus?: string;
  completionPercentage?: number | null;
  summary?: { headline: string; narrative: string[] };
  extraction?: Record<string, unknown> | null;
  extractionFromCache?: boolean;
  redFlags: string[];
  suggestedQuestions: Array<{ question: string; priority: 'critical' | 'high' | 'medium' }>;
  reason?: string;
}> {
  const admin = createAstroAdminClient() as unknown as AdminClient;

  // Get anamnesis record
  const { data: anamnesisRow, error: anamnesisError } = await admin
    .from('anamnesis')
    .select('id, status, privacy_accepted, completion_percentage')
    .eq('patient_id', patientId)
    .is('deleted_at', null)
    .maybeSingle();

  if (anamnesisError) throw anamnesisError;

  const anamnesis = anamnesisRow as AnamnesisRecord | null;

  if (!anamnesis) {
    return {
      hasAnamnesis: false,
      patient: patientProfile,
      redFlags: [],
      suggestedQuestions: [],
      reason: 'not_started',
    };
  }

  // Get anamnesis sections
  const { data: sectionsRaw, error: sectionsError } = await admin
    .from('anamnesis_sections')
    .select('section, data, completed, updated_at')
    .eq('anamnesis_id', anamnesis.id)
    .order('updated_at', { ascending: true });

  if (sectionsError) throw sectionsError;

  const sections = (sectionsRaw ?? []) as SectionRecord[];
  const summary = buildAnamnesisSummary(sections);

  // Get or create AI extraction
  const extractionResult = await getOrCreateExtraction(
    admin,
    anamnesis.id,
    patientId,
    patientProfile.name,
    anamnesis.status,
    sections,
  );

  // Extract red flags and suggested questions
  const extraction = extractionResult?.extraction as Record<string, unknown> | null;
  const redFlags = (extraction?.safetyFlags as string[]) ?? [];
  const clinicianQuestions = (extraction?.clinicianQuestions as string[]) ?? [];
  const nextQuestions = (extraction?.nextQuestions as Array<{ question: string; priority: string }>) ?? [];

  // Merge and sort questions by priority
  const suggestedQuestions = [
    ...clinicianQuestions.map(q => ({ question: q, priority: 'high' as const })),
    ...nextQuestions.map(q => ({
      question: q.question,
      priority: q.priority as 'critical' | 'high' | 'medium',
    })),
  ].sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2 };
    return (order[a.priority as keyof typeof order] ?? 3) - (order[b.priority as keyof typeof order] ?? 3);
  });

  return {
    hasAnamnesis: true,
    patient: patientProfile,
    anamnesisStatus: anamnesis.status,
    completionPercentage: anamnesis.completion_percentage,
    summary,
    extraction,
    extractionFromCache: extractionResult?.fromCache ?? false,
    redFlags,
    suggestedQuestions,
  };
}
