import type { APIRoute } from 'astro';
import type { ClinicalEvidence } from '@autamedica/types/ports';
import { z } from 'zod';
import { createAstroAdminClient } from '@/lib/supabase';
import { badRequest, forbidden, internalError, jsonOk, notFound } from '@/lib/api-helpers';
import { resolveDoctorContext } from '@/lib/doctors/api/doctor-context';
import { createClinicalRulesAdapter } from '@/lib/clinical-safety/repos/clinical-rules.adapter';
import { evaluateClinicalSafetyUseCase } from '@/lib/clinical-safety/usecases/evaluate-clinical-safety.usecase';
import { logger } from '@autamedica/shared';

export const prerender = false;

const EvidenceSchema = z.object({
  painScaleVas: z.number().min(0).max(10).optional(),
  ecgStElevationMm: z.number().min(0).optional(),
  peakEcgStElevationMm: z.number().min(0).optional(),
  troponinHistory: z.array(z.object({
    timestamp: z.string().datetime(),
    valueNgMl: z.number().min(0),
  })).optional(),
  oxygenSaturationPct: z.number().min(0).max(100).optional(),
  glasgowComaScale: z.number().min(3).max(15).optional(),
  hasThunderclapOnset: z.boolean().optional(),
  hasNewFocalDeficits: z.boolean().optional(),
  hasMeningism: z.boolean().optional(),
  isImmunodeficient: z.boolean().optional(),
  customParameters: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

const EvaluateRequestSchema = z.object({
  incidentId: z.string().uuid(),
  evidence: EvidenceSchema,
  overrideReason: z.string().trim().min(8).max(2000).optional(),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolveDoctorContext(request, locals);
  if (!context) return forbidden('doctor_context_required');

  try {
    const parsed = EvaluateRequestSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest(parsed.error.message);

    const admin = createAstroAdminClient(locals.runtime?.env);
    const { data: incident, error: incidentError } = await admin
      .from('clinical_incidents')
      .select('id, doctor_id')
      .eq('id', parsed.data.incidentId)
      .maybeSingle();

    if (incidentError) throw incidentError;
    if (!incident) return notFound('clinical_incident_not_found');
    if (incident.doctor_id !== context.doctorId) return forbidden('forbidden_clinical_incident_access');

    const result = await evaluateClinicalSafetyUseCase(
      {
        supabase: admin,
        clinicalRulesRepo: createClinicalRulesAdapter(admin),
      },
      {
        incidentId: parsed.data.incidentId,
        evidence: parsed.data.evidence as ClinicalEvidence,
        overrideReason: parsed.data.overrideReason,
        authorizedBy: context.userId,
      }
    );

    return jsonOk(result, result.success ? 200 : 422);
  } catch (error) {
    logger.error('[api/doctors/clinical-safety-evaluate] POST failed', error);
    return internalError(
      'clinical_safety_evaluate_failed',
      error instanceof Error ? error.message : String(error)
    );
  }
};
