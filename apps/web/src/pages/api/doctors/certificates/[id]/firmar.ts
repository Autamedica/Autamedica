/**
 * Authenticated clinical signing initiation for FirmAR/PFDR.
 *
 * Never receives the clinical PDF or CUIL from the browser. Runtime release
 * flags default OFF. Only an approved professional with a verified local
 * enrollment can request a session. Return means PENDING, never SIGNED.
 */
import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { badRequest, forbidden, internalError, jsonOk, notFound, serviceUnavailable } from '@/lib/api-helpers';
import { DOCTOR_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { createAstroAdminClient } from '@/lib/supabase';
import { loadMedicalCertificateForDoctor } from '@/lib/doctors/services/medical-certificate-pdf-context.service';
import { generateMedicalCertificatePdf } from '@/lib/doctors/services/pdf-medical-certificate.service';
import { FirmarRemoteClient } from '@/lib/doctors/services/firmar-remote-client';
import { prepareFirmArSigningSession } from '@/lib/doctors/services/firmar/firmar-session-orchestrator';
import { createFirmArSupabaseSessionStore } from '@/lib/doctors/services/firmar/firmar-supabase-session-store';
import { logger } from '@autamedica/shared';

// Hard release gate: do not initiate signatures until the callback can
// independently verify PAdES and durably finalize them. Env flags alone cannot
// bypass this programmatic gate.
const CALLBACK_SIGNATURE_VERIFIER_READY = false;

function runtimeConfig(locals: App.Locals) {
  const vars = (locals.runtime?.env ?? {}) as Record<string, unknown>;
  const configured = (key: string): string => {
    const runtime = vars[key];
    const value = typeof runtime === 'string' ? runtime : import.meta.env[key];
    return typeof value === 'string' ? value : '';
  };
  return {
    enabled: configured('FIRMAR_ENABLED') === 'true',
    approved: configured('FIRMAR_INTEGRATION_APPROVED') === 'true',
    baseUrl: configured('FIRMAR_BASE_URL'),
    apiUser: configured('FIRMAR_API_USER'),
    apiSecret: configured('FIRMAR_API_SECRET'),
  };
}

function validId(value: string | undefined): value is string {
  return Boolean(value && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value));
}

export const GET: APIRoute = async ({ request, params, locals }) => {
  if (!validId(params.id)) return badRequest('invalid_certificate_id');
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;
  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const record = await loadMedicalCertificateForDoctor(admin, params.id, auth.user.id);
    if (!record) return notFound('certificate_not_found');
    const dataClient = admin as unknown as SupabaseClient;
    const { data, error } = await dataClient.from('medical_certificate_signature_requests')
      .select('status,expires_at,created_at')
      .eq('certificate_id', params.id)
      .eq('doctor_id', record.doctorId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return jsonOk({ integrationEnabled: CALLBACK_SIGNATURE_VERIFIER_READY && runtimeConfig(locals).enabled && runtimeConfig(locals).approved,
      certificateStatus: record.status,
      requestStatus: data?.status ?? null,
      expiresAt: data?.expires_at ?? null,
    });
  } catch (error) {
    logger.error('[firmar/status] failed', error);
    return internalError('firmar_status_failed');
  }
};

export const POST: APIRoute = async ({ request, params, locals }) => {
  if (!validId(params.id)) return badRequest('invalid_certificate_id');
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  // Cookie-authenticated POST must originate from the same site as this route.
  // Cross-site form requests must never trigger a remote signing session.
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) {
    return forbidden('firmar_cross_origin_request');
  }

  const cfg = runtimeConfig(locals);
  if (!cfg.enabled || !cfg.approved) return serviceUnavailable('firmar_integration_pending_authorization');
  if (!cfg.apiUser || !cfg.apiSecret || !cfg.baseUrl) {
    return serviceUnavailable('firmar_credentials_not_configured');
  }
  if (!CALLBACK_SIGNATURE_VERIFIER_READY) return serviceUnavailable('firmar_callback_verifier_not_ready');

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const record = await loadMedicalCertificateForDoctor(admin, params.id, auth.user.id);
    if (!record) return notFound('certificate_not_found');
    if (record.countryCode !== 'AR' || record.status !== 'draft') {
      return forbidden('certificate_not_signable');
    }
    if (!record.pdfInput.doctorLicense.trim() || !record.pdfInput.doctorName.trim()) {
      return forbidden('doctor_professional_identity_incomplete');
    }
    // Only service-role backend can read or modify doctor CUIL registration.
    const dataClient = admin as unknown as SupabaseClient;
    const { data: enrollment, error: enrollmentError } = await dataClient
      .from('doctor_firmar_enrollments')
      .select('doctor_id,cuil,verification_status')
      .eq('doctor_id', record.doctorId)
      .maybeSingle();
    if (enrollmentError) throw enrollmentError;
    if (enrollment?.verification_status !== 'verified') {
      return forbidden('firmar_doctor_not_verified');
    }

    const pdfBytes = generateMedicalCertificatePdf(record.pdfInput, 'signing-source');
    const gateway = new FirmarRemoteClient({
      baseUrl: cfg.baseUrl, apiUser: cfg.apiUser, apiSecret: cfg.apiSecret,
    });
    const session = await prepareFirmArSigningSession({
      integrationEnabled: cfg.enabled,
      integrationApproved: cfg.approved,
      authenticatedDoctorId: record.doctorId,
      draft: {
        certificateId: record.certificateId,
        doctorId: record.doctorId,
        countryCode: record.countryCode,
        status: record.status,
        pdfBytes,
      },
      enrollment: {
        doctorId: enrollment.doctor_id as string,
        cuil: enrollment.cuil as string,
        verificationStatus: enrollment.verification_status as 'verified',
      },
      // Fixed, vetted site route. Never construct from user headers/payload.
      returnUrl: 'https://www.autamedica.com/doctors/certificates/return',
      store: createFirmArSupabaseSessionStore(admin),
      gateway,
    });
    return jsonOk({
      status: session.status,
      authorizationUrl: session.authorizationUrl,
    }, 202);
  } catch (error) {
    logger.error('[firmar/initiate] rejected', error instanceof Error ? error.message : 'error');
    return internalError('firmar_session_creation_failed');
  }
};
