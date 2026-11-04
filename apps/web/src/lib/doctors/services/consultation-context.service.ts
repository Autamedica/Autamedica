/**
 * Service: consultation context business logic.
 * Extracted from /api/doctors/consultations/[roomId]/context.ts.
 * Orchestrates anamnesis retrieval, AI extraction, and context assembly.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Json } from '@autamedica/types'
import { buildAnamnesisSummary, logger } from '@autamedica/shared'
import { createHash } from 'node:crypto'
import {
  buildAnamnesisExtractionRequest,
  executeAnamnesisExtraction,
  isAnamnesisExtractionConfigured,
  ANAMNESIS_EXTRACTION_PROMPT_VERSION,
} from '@/lib/patients/server/anamnesis-ai-extraction'
import { resolveDoctorId, resolveRoomParticipants, resolvePatientProfile, isClinicalPatientId, type ResolvedRoomParticipants } from '@/lib/doctors/lib/resolve-room'

type AdminClient = SupabaseClient

interface AnamnesisRecord {
  id: string
  status: string
  privacy_accepted: boolean | null
  completion_percentage: number | null
}

interface SectionRecord {
  section: string
  data: Json
  completed: boolean | null
  updated_at: string | null
}

interface ExtractionCacheRecord {
  extraction_result: unknown
  provider_name: string
  model_name: string
  prompt_version: string
}

export interface ConsultationContextResult {
  hasAnamnesis: boolean
  patient: { id?: string | null; name: string; dateOfBirth: string | null; gender: string | null } | null
  anamnesisStatus?: string
  completionPercentage?: number | null
  summary: ReturnType<typeof buildAnamnesisSummary> | null
  extraction: Record<string, unknown> | null
  extractionFromCache?: boolean
  redFlags: string[]
  suggestedQuestions: Array<{ question: string; priority: string }>
  reason?: string
  /** Only present for on-demand pharmacy kiosk patients */
  dispatchTriage?: {
    patientDni: string | null
    symptomSummary: string | null
    dispatchRequestId: string
  }
}

function computeSectionsHash(sections: SectionRecord[]): string {
  const content = sections
    .map(s => `${s.section}:${JSON.stringify(s.data)}`)
    .sort()
    .join('|')
  return createHash('sha256').update(content).digest('hex')
}

async function getOrCreateExtraction(
  admin: AdminClient,
  anamnesisId: string,
  patientId: string,
  patientLabel: string,
  anamnesisStatus: string,
  sections: SectionRecord[],
): Promise<{ extraction: unknown; fromCache: boolean } | null> {
  if (!isAnamnesisExtractionConfigured()) return null

  const sectionsHash = computeSectionsHash(sections)

  const { data: cached } = await admin
    .from('anamnesis_extractions')
    .select('extraction_result, provider_name, model_name, prompt_version')
    .eq('anamnesis_id', anamnesisId)
    .eq('source_sections_hash', sectionsHash)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (cached) {
    return { extraction: (cached as ExtractionCacheRecord).extraction_result, fromCache: true }
  }

  try {
    const request = buildAnamnesisExtractionRequest({
      patientId,
      patientLabel,
      anamnesisStatus,
      privacyAccepted: true,
      sections,
    })

    const { result, providerName, modelName } = await executeAnamnesisExtraction(request)

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
    )

    return { extraction: result, fromCache: false }
  } catch (err) {
    logger.error('[consultation-context] AI extraction failed, returning without extraction', err)
    return null
  }
}

export const consultationContextService = {
  async verifyDoctorAccess(admin: AdminClient, userId: string): Promise<string | null> {
    return resolveDoctorId(admin, userId)
  },

  async getContext(
    admin: AdminClient,
    roomId: string,
    authorizedParticipants?: ResolvedRoomParticipants,
  ): Promise<ConsultationContextResult> {
    // Routes must perform room-ownership authorization before supplying
    // participants. Reuse the same verified snapshot to avoid a second lookup.
    const participants = authorizedParticipants ?? await resolveRoomParticipants(admin, roomId)
    if (!participants) {
      return { hasAnamnesis: false, patient: null, summary: null, extraction: null, redFlags: [], suggestedQuestions: [] }
    }

    const { patientId } = participants

    // Pharmacy visits may use a real, isolated patient UUID; this alone does
    // not prove identity or authorize issuing prescriptions/certificates.
    if (participants.triage) {
      const { triage } = participants
      return {
        hasAnamnesis: false,
        patient: {
          id: isClinicalPatientId(patientId) ? patientId : null,
          name: triage.patientName || 'Paciente Kiosco',
          dateOfBirth: null,
          gender: null,
        },
        summary: null,
        extraction: null,
        redFlags: [],
        suggestedQuestions: [],
        reason: 'kiosk_dispatch',
        dispatchTriage: {
          patientDni: triage.patientDni,
          symptomSummary: triage.symptomSummary,
          dispatchRequestId: triage.dispatchRequestId,
        },
      }
    }

    const patientProfile = await resolvePatientProfile(admin, patientId)

    if (!patientId) {
      return {
        hasAnamnesis: false,
        patient: { id: null, ...patientProfile },
        summary: null,
        extraction: null,
        redFlags: [],
        suggestedQuestions: [],
        reason: 'guest_call',
      }
    }

    const { data: anamnesisRow, error: anamnesisError } = await admin
      .from('anamnesis')
      .select('id, status, privacy_accepted, completion_percentage')
      .eq('patient_id', patientId)
      .is('deleted_at', null)
      .maybeSingle()

    if (anamnesisError) throw anamnesisError

    const anamnesis = anamnesisRow as AnamnesisRecord | null

    if (!anamnesis) {
      return {
        hasAnamnesis: false,
        patient: patientProfile,
        summary: null,
        extraction: null,
        redFlags: [],
        suggestedQuestions: [],
        reason: 'not_started',
      }
    }

    const { data: sectionsRaw, error: sectionsError } = await admin
      .from('anamnesis_sections')
      .select('section, data, completed, updated_at')
      .eq('anamnesis_id', anamnesis.id)
      .order('updated_at', { ascending: true })

    if (sectionsError) throw sectionsError

    const sections = (sectionsRaw ?? []) as SectionRecord[]
    const summary = buildAnamnesisSummary(sections)

    const extractionResult = await getOrCreateExtraction(
      admin, anamnesis.id, patientId, patientProfile.name, anamnesis.status, sections,
    )

    const extraction = extractionResult?.extraction as Record<string, unknown> | null
    const redFlags = (extraction?.safetyFlags as string[]) ?? []
    const clinicianQuestions = (extraction?.clinicianQuestions as string[]) ?? []
    const nextQuestions = (extraction?.nextQuestions as Array<{ question: string; priority: string }>) ?? []

    const suggestedQuestions = [
      ...clinicianQuestions.map(q => ({ question: q, priority: 'high' as const })),
      ...nextQuestions.map(q => ({ question: q.question, priority: q.priority })),
    ].sort((a, b) => {
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2 }
      return (order[a.priority] ?? 3) - (order[b.priority] ?? 3)
    })

    return {
      hasAnamnesis: true,
      patient: { id: patientId, ...patientProfile },
      anamnesisStatus: anamnesis.status,
      completionPercentage: anamnesis.completion_percentage,
      summary,
      extraction,
      extractionFromCache: extractionResult?.fromCache ?? false,
      redFlags,
      suggestedQuestions,
    }
  },
}
