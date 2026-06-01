import type { APIRoute } from 'astro';
import type { ClinicalEvidence } from '@autamedica/types/ports';
import type { Json } from '@autamedica/types';
import { z } from 'zod';
import { createAstroAdminClient } from '@/lib/supabase';
import { badRequest, forbidden, internalError, jsonFail, jsonOk, notFound } from '@/lib/api-helpers';
import { resolveDoctorContext } from '@/lib/doctors/api/doctor-context';
import { createClinicalRulesAdapter } from '@/lib/clinical-safety/repos/clinical-rules.adapter';
import { evaluateClinicalSafetyUseCase } from '@/lib/clinical-safety/usecases/evaluate-clinical-safety.usecase';
import { careEpisodesService } from '@/lib/clinical-safety/services/care-episodes.service';
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

const CloseIncidentRequestSchema = z.object({
  incidentId: z.string().uuid(),
  evidence: EvidenceSchema,
  resolutionNotes: z.string().trim().min(3).max(2000).optional(),
  overrideReason: z.string().trim().min(8).max(2000).optional(),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolveDoctorContext(request, locals);
  if (!context) return forbidden('doctor_context_required');

  try {
    const parsed = CloseIncidentRequestSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest(parsed.error.message);

    const admin = createAstroAdminClient(locals.runtime?.env);
    const { data: incident, error: incidentError } = await admin
      .from('clinical_incidents')
      .select('id, doctor_id, status')
      .eq('id', parsed.data.incidentId)
      .maybeSingle();

    if (incidentError) throw incidentError;
    if (!incident) return notFound('clinical_incident_not_found');
    if (incident.doctor_id !== context.doctorId) return forbidden('forbidden_clinical_incident_access');

    if (incident.status === 'resolved' || incident.status === 'closed') {
      return jsonOk({
        closed: true,
        incidentId: incident.id,
        status: incident.status,
        evaluation: null,
      });
    }

    const evaluation = await evaluateClinicalSafetyUseCase(
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

    if (!evaluation.success || evaluation.recommendation !== 'allow_closure') {
      try {
        await careEpisodesService.recordClosureReviewForIncident(admin, {
          incidentId: parsed.data.incidentId,
          doctorUserId: context.userId,
          resolutionAllowed: false,
          overrideUsed: Boolean(parsed.data.overrideReason),
        });
      } catch (recordError) {
        logger.error('[clinical-safety-close-incident] failed to record blocked closure review', {
          incidentId: parsed.data.incidentId,
          doctorUserId: context.userId,
          error: recordError instanceof Error ? recordError.message : String(recordError),
        });
      }

      return jsonFail(
        'CONFLICT',
        'clinical_safety_blocks_closure',
        409,
        { evaluation }
      );
    }

    const resolvedAt = new Date().toISOString();
    const { data: updatedIncident, error: updateError } = await admin
      .from('clinical_incidents')
      .update({
        status: 'resolved',
        resolved_at: resolvedAt,
        closed_by: context.userId,
        resolution_notes: parsed.data.resolutionNotes ?? evaluation.reason ?? null,
      })
      .eq('id', parsed.data.incidentId)
      .select('id, status, resolved_at')
      .single();

    if (updateError) throw updateError;

    const { error: eventError } = await admin
      .from('clinical_incident_events')
      .insert({
        incident_id: parsed.data.incidentId,
        actor_id: context.userId,
        from_status: incident.status,
        to_status: 'resolved',
        event_description: parsed.data.resolutionNotes ?? evaluation.reason ?? 'Incidente resuelto con gate CEEDS.',
        clinical_evidence: parsed.data.evidence as unknown as Json,
      });

    if (eventError) throw eventError;

    try {
      await careEpisodesService.recordClosureReviewForIncident(admin, {
        incidentId: parsed.data.incidentId,
        doctorUserId: context.userId,
        resolutionAllowed: true,
        overrideUsed: Boolean(parsed.data.overrideReason),
      });
    } catch (recordError) {
      logger.error('[clinical-safety-close-incident] failed to record allowed closure review', {
        incidentId: parsed.data.incidentId,
        doctorUserId: context.userId,
        error: recordError instanceof Error ? recordError.message : String(recordError),
      });
    }

    return jsonOk({
      closed: true,
      incident: updatedIncident,
      evaluation,
    });
  } catch (error) {
    logger.error('[api/doctors/clinical-safety-close-incident] POST failed', error);
    return internalError(
      'clinical_safety_close_incident_failed',
      error instanceof Error ? error.message : String(error)
    );
  }
};
