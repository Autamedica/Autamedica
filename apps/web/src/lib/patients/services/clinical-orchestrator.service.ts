/**
 * Clinical Orchestrator (Capa 3/11).
 * Centralizes cross-service business logic triggered by domain events.
 */
import { domainEvents, logger } from '@autamedica/shared'

logger.info('[ClinicalOrchestrator] Initializing clinical event listeners')

// Psychiatry/TDAH now owns its own intake flow.
// Do not trigger neuro from the general anamnesis event path anymore.
domainEvents.on('anamnesis.completed', async ({ patientId, anamnesisId }) => {
  logger.info('[ClinicalOrchestrator] Ignoring anamnesis.completed for neuro', {
    patientId,
    anamnesisId,
    reason: 'psychiatry_intake_separated_from_general_anamnesis',
  })
})

export const clinicalOrchestrator = {
  initialized: true
}
