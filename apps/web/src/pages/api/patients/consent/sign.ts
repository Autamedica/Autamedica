/**
 * POST /api/patients/consent/sign
 * Paciente autenticado firma un consentimiento informado.
 * Body: { consentType, templateVersion, acceptedSections[], pdfUrl? }
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { SupabaseConsentRepository } from '@autamedica/prescriptions';
import type { ConsentType } from '@autamedica/prescriptions';
import type { PatientId } from '@autamedica/types';
import { resolvePatientContext } from '@/lib/patients/api/patient-context';
import { createAstroAdminClient } from '@/lib/supabase';
import { jsonOk, unauthorized, badRequest, internalError } from '@/lib/api-helpers';

const VALID_CONSENT_TYPES: ConsentType[] = [
  'general',
  'psychiatry_controlled',
  'telemedicine',
  'data_sharing_insurance',
  'data_sharing_anmat',
];

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const admin = createAstroAdminClient(locals.runtime?.env);
  const ctx = await resolvePatientContext(request, locals);
  if (!ctx?.patientId) return unauthorized('patient auth required');

  let body: {
    consentType?: string;
    templateVersion?: string;
    acceptedSections?: string[];
    pdfUrl?: string;
  };
  try {
    body = await request.json();
  } catch {
    return badRequest('invalid JSON');
  }

  if (!body.consentType || !VALID_CONSENT_TYPES.includes(body.consentType as ConsentType)) {
    return badRequest(`consentType must be one of: ${VALID_CONSENT_TYPES.join(', ')}`);
  }
  if (!body.templateVersion) return badRequest('templateVersion required');
  if (!Array.isArray(body.acceptedSections) || body.acceptedSections.length === 0) {
    return badRequest('acceptedSections must be a non-empty array');
  }

  try {
    const repo = new SupabaseConsentRepository(admin);
    const signed = await repo.sign({
      patientId: ctx.patientId as PatientId,
      // ctx.patientId provee el patient_id validado por middleware
      consentType: body.consentType as ConsentType,
      templateVersion: body.templateVersion,
      acceptedSections: body.acceptedSections,
      pdfUrl: body.pdfUrl,
      ipAddress: clientAddress ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });
    logger.info(`[patients/consent/sign] patient=${ctx.patientId} type=${body.consentType} version=${body.templateVersion}`);
    return jsonOk({ consent: signed });
  } catch (err) {
    logger.error('[patients/consent/sign] failed', err);
    return internalError(err instanceof Error ? err.message : 'sign failed');
  }
};
