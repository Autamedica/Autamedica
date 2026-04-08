/**
 * Use Case: Neuro Stability Evaluation (Capa 3).
 * Integrates Extraction results with Vitals to compute the Stability Score.
 * Handles high-complexity CNS stimulants treatments.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { logger } from '@autamedica/shared'
import { NeuroScoringEngine, type ScoringResult } from '../scoring.engine'
import { createAnamnesisExtractionAdapter } from '@/lib/patients/lib/repos/anamnesis-extraction.adapter'

type Db = SupabaseClient<Database>

export interface EvaluateStabilityInput {
  patientId: string
  anamnesisId: string
}

export async function evaluateNeuroStability(
  supabase: Db,
  input: EvaluateStabilityInput
): Promise<ScoringResult | null> {
  const { patientId, anamnesisId } = input

  try {
    // 1. Fetch latest extraction
    const extractionRepo = createAnamnesisExtractionAdapter(supabase)
    const extraction = await extractionRepo.getLatest(anamnesisId)

    if (!extraction) {
      logger.warn('[evaluateNeuroStability] No extraction found for anamnesis', { anamnesisId })
      return null
    }

    // 2. Fetch latest vitals
    const { data: vitals, error: vitalsError } = await supabase
      .from('vital_signs')
      .select('*')
      .eq('patient_id', patientId)
      .order('measured_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (vitalsError) {
      logger.error('[evaluateNeuroStability] Failed to fetch vitals', vitalsError)
    }

    // 3. Prepare data for Scoring Engine
    const extractionResult = extraction.extraction_result as Record<string, unknown>
    const redFlags = extractionResult.safetyFlags || []
    
    // Extraction vitals (from AI)
    const extVitals = extractionResult.normalizedOpenFields?.vitals

    const scoringData = {
      vitals: {
        bloodPressure: (vitals 
          ? `${vitals.blood_pressure_systolic}/${vitals.blood_pressure_diastolic}`
          : extVitals?.bloodPressure) || null,
        heartRate: vitals?.heart_rate ?? extVitals?.heartRate,
        weight: vitals?.weight ?? extVitals?.weightKg,
      },
      sideEffects: extractionResult.qualityAlerts || [],
      redFlags: {
        suicidalIdeation: redFlags.some((f: string) => f.toLowerCase().includes('suicid')),
        doseEscalation: redFlags.some((f: string) => f.toLowerCase().includes('dosis') || f.toLowerCase().includes('abuso')),
      }
    }

    // 4. Compute Score
    const result = NeuroScoringEngine.compute(scoringData)

    // 5. Persist as Stability Report (Capa 4 - The Evidence)
    const { error: recordError } = await supabase
      .from('medical_records')
      .insert({
        patient_id: patientId,
        title: `Stability Report - Neuro - ${result.score}`,
        type: 'neuro_stability_report',
        content: {
          ...result,
          vitals_snapshot: scoringData.vitals,
          extraction_id: extraction.id,
          computed_at: new Date().toISOString()
        },
        date_recorded: new Date().toISOString(),
        visibility: 'doctor'
      })

    if (recordError) {
      logger.error('[evaluateNeuroStability] Failed to save stability report', recordError)
    }

    logger.info('[evaluateNeuroStability] Stability evaluation completed', {
      patientId,
      score: result.score,
      reasonsCount: result.reasons.length
    })

    return result
  } catch (err) {
    logger.error('[evaluateNeuroStability] Unexpected error', err)
    return null
  }
}
