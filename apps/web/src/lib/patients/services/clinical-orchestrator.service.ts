/**
 * Clinical Orchestrator (Capa 3/11).
 * Centralizes cross-service business logic triggered by domain events.
 */
import { domainEvents, logger } from '@autamedica/shared'
import { evaluateNeuroStability } from '../verticals/neuro/usecases/evaluate-stability.usecase'
import { createAstroAdminClient } from '@/lib/supabase'

logger.info('[ClinicalOrchestrator] Initializing clinical event listeners')

// --- Neuro Vertical (ADHD, Narcolepsy, etc.) ---
domainEvents.on('anamnesis.completed', async ({ patientId, anamnesisId }) => {
  logger.info('[ClinicalOrchestrator] Anamnesis completed event received', { patientId, anamnesisId })
  
  try {
    const admin = createAstroAdminClient()
    
    // Trigger Neuro scoring for stimulants stability.
    await evaluateNeuroStability(admin, { patientId, anamnesisId })
    
  } catch (err) {
    logger.error('[ClinicalOrchestrator] Failed to process anamnesis.completed', {
      patientId,
      anamnesisId,
      error: err instanceof Error ? err.message : err
    })
  }
})

export const clinicalOrchestrator = {
  initialized: true
}
