/**
 * Service: Anamnesis AI extraction orchestration.
 * Capa 6 — Orquesta: recibe secciones, llama al motor de IA, persiste resultado.
 * No implementa lógica de IA — delega a executeAnamnesisExtraction().
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import {
  buildAnamnesisExtractionRequest,
  executeAnamnesisExtraction,
  isAnamnesisExtractionConfigured,
  ANAMNESIS_EXTRACTION_PROMPT_VERSION,
} from '@/lib/patients/server/anamnesis-ai-extraction'
import {
  anamnesisExtractionRepo,
  type ExtractionCheckpoint,
} from '@/lib/patients/lib/repos/anamnesis-extraction.repo'
import type {
  AnamnesisClarificationTurn,
  AnamnesisSectionRecord,
} from '@/lib/patients/types/anamnesis-extraction'

type Db = SupabaseClient<Database>

export interface ExtractionServiceInput {
  patientId: string
  patientLabel: string
  anamnesisId: string
  anamnesisStatus: string
  privacyAccepted: boolean
  sections: AnamnesisSectionRecord[]
  clarificationTurns?: AnamnesisClarificationTurn[]
  checkpoint: ExtractionCheckpoint
  /** Sections modified in this revisit. Undefined = first visit (analyze all). */
  modifiedSections?: string[]
}

export interface NextQuestion {
  priority: 'critical' | 'high' | 'medium'
  targetSection: string
  questionType: 'open' | 'closed' | 'clarification'
  question: string
  rationale: string
}

export interface QualityAlert {
  severity: 'low' | 'medium' | 'high'
  code: string
  message: string
  sourceSections: string[]
}

export interface ExtractionServiceResult {
  extractionId: string
  checkpoint: ExtractionCheckpoint
  guidance: {
    nextQuestions: NextQuestion[]
    qualityAlerts: QualityAlert[]
    coverage: { adequate: string[]; weak: string[] }
    safetyFlags: string[]
  }
  hasCriticalQuestions: boolean
}

export const anamnesisExtractionService = {
  isConfigured(): boolean {
    return isAnamnesisExtractionConfigured()
  },

  async execute(
    supabase: Db,
    input: ExtractionServiceInput,
  ): Promise<ExtractionServiceResult> {
    if (!isAnamnesisExtractionConfigured()) {
      throw new Error('AI extraction not configured — missing API keys')
    }

    // 1. Build request (reutiliza función existente)
    const request = buildAnamnesisExtractionRequest({
      patientId: input.patientId,
      patientLabel: input.patientLabel,
      anamnesisStatus: input.anamnesisStatus,
      privacyAccepted: input.privacyAccepted,
      sections: input.sections,
      clarificationTurns: input.clarificationTurns,
      modifiedSections: input.modifiedSections,
    })

    // 2. Execute extraction (Gemini 3.1 Flash Preview)
    const { providerName, modelName, result } = await executeAnamnesisExtraction(request)

    logger.info('[ExtractionService] Extraction completed', {
      checkpoint: input.checkpoint,
      provider: providerName,
      model: modelName,
      questionsCount: result.nextQuestions?.length ?? 0,
      alertsCount: result.qualityAlerts?.length ?? 0,
      coverageAdequate: result.argenteCoverage?.adequatelyCovered?.length ?? 0,
      coverageWeak: result.argenteCoverage?.weakOrMissing?.length ?? 0,
    })

    // 3. Determine if there are critical questions
    const nextQuestions = (result.nextQuestions ?? []) as NextQuestion[]
    const hasCritical = nextQuestions.some(q => q.priority === 'critical')

    // 4. Persist via repository (Capa 7)
    const record = await anamnesisExtractionRepo.upsert(supabase, {
      anamnesis_id: input.anamnesisId,
      patient_id: input.patientId,
      checkpoint: input.checkpoint,
      extraction_result: result as unknown as Record<string, unknown>,
      provider: providerName,
      model: modelName,
      prompt_version: ANAMNESIS_EXTRACTION_PROMPT_VERSION,
      sections_count: input.sections.length,
      has_critical_questions: hasCritical,
    })

    // 5. Return guidance for frontend
    return {
      extractionId: record.id,
      checkpoint: input.checkpoint,
      guidance: {
        nextQuestions,
        qualityAlerts: (result.qualityAlerts ?? []) as QualityAlert[],
        coverage: {
          adequate: result.argenteCoverage?.adequatelyCovered ?? [],
          weak: result.argenteCoverage?.weakOrMissing ?? [],
        },
        safetyFlags: result.safetyFlags ?? [],
      },
      hasCriticalQuestions: hasCritical,
    }
  },
}
