/**
 * POST /api/patients/adverse-events/report
 * Paciente autenticado reporta una reacción adversa (RAM).
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { SupabaseAdverseReactionRepository } from '@autamedica/prescriptions';
import type {
  AdverseReactionSeverity,
  AdverseReactionSymptom,
  Outcome,
} from '@autamedica/prescriptions';
import type { PatientId, PrescriptionId } from '@autamedica/types';
import { resolvePatientContext } from '@/lib/patients/api/patient-context';
import { createAstroAdminClient } from '@/lib/supabase';
import { jsonOk, unauthorized, badRequest, internalError } from '@/lib/api-helpers';

const VALID_SEVERITY: AdverseReactionSeverity[] = ['mild', 'moderate', 'severe', 'life_threatening', 'fatal'];
const VALID_OUTCOME: Outcome[] = ['recovered', 'recovering', 'not_recovered', 'sequelae', 'fatal', 'unknown'];

export const POST: APIRoute = async ({ request, locals }) => {
  const admin = createAstroAdminClient(locals.runtime?.env);
  const ctx = await resolvePatientContext(request, locals);
  if (!ctx?.patientId) return unauthorized('patient auth required');

  let body: {
    prescriptionId?: string;
    onsetDate?: string;
    resolutionDate?: string;
    suspectedDrug?: string;
    symptoms?: AdverseReactionSymptom[];
    severity?: string;
    actionTaken?: string;
    outcome?: string;
    narrative?: string;
  };
  try {
    body = await request.json();
  } catch {
    return badRequest('invalid JSON');
  }

  if (!body.onsetDate) return badRequest('onsetDate required');
  if (!body.suspectedDrug) return badRequest('suspectedDrug required');
  if (!Array.isArray(body.symptoms) || body.symptoms.length === 0) {
    return badRequest('symptoms must be a non-empty array');
  }
  if (!body.severity || !VALID_SEVERITY.includes(body.severity as AdverseReactionSeverity)) {
    return badRequest(`severity must be one of: ${VALID_SEVERITY.join(', ')}`);
  }
  if (body.outcome && !VALID_OUTCOME.includes(body.outcome as Outcome)) {
    return badRequest(`outcome must be one of: ${VALID_OUTCOME.join(', ')}`);
  }

  try {
    const patientId = ctx.patientId as PatientId;
    const prescriptionId = body.prescriptionId ? body.prescriptionId as PrescriptionId : undefined;
    if (prescriptionId) {
      const { data: prescription, error: prescriptionError } = await admin
        .from('prescriptions')
        .select('id, patient_id')
        .eq('id', prescriptionId)
        .eq('patient_id', patientId)
        .maybeSingle();

      if (prescriptionError) {
        logger.error('[patients/adverse-events/report] prescription ownership check failed', prescriptionError);
        return internalError('prescription validation failed');
      }
      if (!prescription) {
        return badRequest('prescriptionId is invalid for this patient');
      }
    }

    const repo = new SupabaseAdverseReactionRepository(admin);
    const report = await repo.submit({
      patientId,
      prescriptionId,
      reportedBy: 'patient',
      onsetDate: body.onsetDate,
      resolutionDate: body.resolutionDate,
      suspectedDrug: body.suspectedDrug,
      symptoms: body.symptoms,
      severity: body.severity as AdverseReactionSeverity,
      actionTaken: body.actionTaken,
      outcome: body.outcome as Outcome | undefined,
      narrative: body.narrative,
    });
    logger.info(`[patients/adverse-events/report] patient=${ctx.patientId} severity=${body.severity} drug=${body.suspectedDrug}`);
    return jsonOk({ report });
  } catch (err) {
    logger.error('[patients/adverse-events/report] failed', err);
    return internalError(err instanceof Error ? err.message : 'submit failed');
  }
};
