import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ClinicalEvidence } from '@autamedica/types';
import { logger, domainEvents } from '@autamedica/shared';
import { evaluateClinicalSafety } from '@autamedica/shared';
import type { IClinicalRulesRepository } from '@autamedica/types';

type Db = SupabaseClient<Database>;

export interface EvaluateSafetyRequest {
  incidentId: string;
  evidence: ClinicalEvidence;
  overrideReason?: string;
  authorizedBy?: string;
}

export interface EvaluateSafetyResponse {
  success: boolean;
  isValid: boolean;
  recommendation: 'allow_closure' | 'block_closure' | 'escalate';
  reason?: string;
  executionId?: string;
  overrideId?: string;
  outboxId?: string;
}

export interface EvaluateSafetyDeps {
  supabase: Db;
  clinicalRulesRepo: IClinicalRulesRepository;
}

export async function evaluateClinicalSafetyUseCase(
  deps: EvaluateSafetyDeps,
  input: EvaluateSafetyRequest
): Promise<EvaluateSafetyResponse> {
  const { supabase, clinicalRulesRepo } = deps;
  const { incidentId, evidence, overrideReason, authorizedBy } = input;

  try {
    // 1. Fetch clinical incident from DB
    const { data: incident, error: incidentErr } = await supabase
      .from('clinical_incidents')
      .select('*')
      .eq('id', incidentId)
      .maybeSingle();

    if (incidentErr || !incident) {
      logger.error('[EvaluateSafetyUseCase] Incident not found', { incidentId, error: incidentErr });
      throw new Error(`Incident not found: ${incidentId}`);
    }

    const { patient_id, doctor_id, snomed_concept_id, setting } = incident;

    // 2. Resolve matching clinical rule in catalog
    const rule = await clinicalRulesRepo.getRuleBySnomedOrCie10(snomed_concept_id);
    if (!rule) {
      logger.info('[EvaluateSafetyUseCase] No cataloged clinical rule found for diagnosis', { snomed_concept_id });
      // If no rule is found, we permit resolution to avoid blocking the clinician (shadow-mode fallback)
      return {
        success: true,
        isValid: true,
        recommendation: 'allow_closure',
        reason: 'Sin regla de seguridad catalogada para este diagnóstico.',
      };
    }

    // 3. Resolve active rule version
    const activeVersion = await clinicalRulesRepo.getActiveVersion(rule.id);
    if (!activeVersion) {
      logger.warn('[EvaluateSafetyUseCase] No active rule version found', { ruleId: rule.id });
      return {
        success: true,
        isValid: true,
        recommendation: 'allow_closure',
        reason: 'Regla de seguridad catalogada sin versión activa.',
      };
    }

    const versionId = activeVersion.id;

    // 4. Load required conditions, criteria, and red flags for evaluation
    const [conditions, requiredObs, criteria, redFlags] = await Promise.all([
      clinicalRulesRepo.getConditions(versionId),
      clinicalRulesRepo.getRequiredObservations(versionId),
      clinicalRulesRepo.getResolutionCriteria(versionId),
      clinicalRulesRepo.getRedFlags(versionId),
    ]);

    // 5. Find trigger condition for the current clinical setting
    const condition = conditions.find((c) => c.setting === setting);
    const requiresOverride = condition ? condition.requires_override : true;
    const blocksClosure = condition ? condition.blocks_closure : true;

    // 6. Attach loinc_code from required observations to criteria for engine extraction
    const criteriaWithLoinc = criteria.map((crit) => {
      const obs = requiredObs.find((o) => o.id === crit.required_observation_id);
      return {
        ...crit,
        loinc_code: obs ? obs.loinc_code : null,
      };
    });

    // Evaluate clinical evidence dynamically against rules catalog
    const evaluation = evaluateClinicalSafety(evidence, criteriaWithLoinc, redFlags);

    let recommendation: 'allow_closure' | 'block_closure' | 'escalate' = 'allow_closure';
    let finalIsValid = evaluation.isValid;
    let reason = evaluation.reason;

    if (!evaluation.isValid) {
      recommendation = blocksClosure ? 'block_closure' : 'escalate';
    }

    // 7. Handle override request if recommendation is blocking and doctor justified it
    let finalOverrideReason: string | undefined = undefined;
    if (!finalIsValid && overrideReason && overrideReason.trim() !== '') {
      if (requiresOverride) {
        recommendation = 'allow_closure';
        finalIsValid = true;
        finalOverrideReason = overrideReason.trim();
        reason = `Superado por criterio médico: ${overrideReason}`;
      } else {
        logger.warn('[EvaluateSafetyUseCase] Override attempted but rule condition forbids overrides', { versionId, setting });
      }
    }

    // 8. Execute Atomic Transaction via PL/pgSQL transaction helper
    const { data: txResult, error: txError } = await supabase.rpc(
      'log_clinical_rule_evaluation_transaction',
      {
        p_rule_version_id: versionId,
        p_incident_id: incidentId,
        p_patient_id: patient_id,
        p_doctor_id: doctor_id,
        p_evidence_used: evidence as unknown as Record<string, unknown>,
        p_recommendation: recommendation,
        p_reason: reason || 'Evaluación de seguridad clínica satisfactoria.',
        p_override_reason: finalOverrideReason || null,
        p_authorized_by: authorizedBy || null,
      } as unknown as Record<string, unknown>
    );

    if (txError || !txResult) {
      logger.error('[EvaluateSafetyUseCase] Transaction logging failed', txError);
      throw new Error(`Failed to commit clinical evaluation: ${txError?.message || 'Unknown error'}`);
    }

    const { execution_id, override_id, outbox_id } = txResult as {
      execution_id: string;
      override_id: string | null;
      outbox_id: string;
    };

    // 9. Emit a local domain event to notify system modules of clinical evaluation
    try {
      await domainEvents.emit('clinical.safety_rule_evaluated', {
        incidentId,
        patientId: patient_id,
        doctorId: doctor_id,
        recommendation,
        isValid: finalIsValid,
        reason,
        executionId: execution_id,
        overrideId: override_id,
        outboxId: outbox_id,
      });
    } catch (eventErr) {
      logger.warn('[EvaluateSafetyUseCase] Domain event emit failed', eventErr);
    }

    return {
      success: true,
      isValid: finalIsValid,
      recommendation,
      reason,
      executionId: execution_id,
      overrideId: override_id,
      outboxId: outbox_id,
    };
  } catch (err) {
    logger.error('[EvaluateSafetyUseCase] Execution encountered error', err);
    return {
      success: false,
      isValid: false,
      recommendation: 'block_closure',
      reason: err instanceof Error ? err.message : 'Error interno de seguridad clínica.',
    };
  }
}
