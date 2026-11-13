/**
 * Read-only production credential smoke test for Memed.
 * Restricted to authenticated platform administrators. Does not create
 * a prescriber, prescription, patient record, or provider-side mutation.
 */
import type { APIRoute } from 'astro';
import { ADMIN_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { jsonOk, serviceUnavailable } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';
import { getMemedDoctorCpf } from '@/lib/prescriptions/brazil/memed-identity.repository';
import { assessMemedPilotReadiness } from '@/lib/prescriptions/brazil/memed-readiness';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, ADMIN_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  const env = locals.runtime?.env;
  const apiKey = env?.MEMED_API_KEY;
  const secretKey = env?.MEMED_SECRET_KEY;
  const apiBase = env?.MEMED_API_URL;
  if (typeof apiKey !== 'string' || !apiKey ||
      typeof secretKey !== 'string' || !secretKey ||
      apiBase !== 'https://api.memed.com.br/v1') {
    return serviceUnavailable('memed_production_configuration_incomplete');
  }

  // Memed's documented read-only key validation accepts partner keys in query
  // parameters. Only a fixed host and read-only path are allowed.
  const url = new URL('https://api.memed.com.br/v1/sinapse-prescricao/check-key');
  url.searchParams.set('api-key', apiKey);
  url.searchParams.set('secret-key', secretKey);


  try {
    // Preflight is read-only; never creates a Memed user, prescription, or patient.
    const pilotId = typeof env?.MEMED_PILOT_DOCTOR_ID === 'string'
      && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(env.MEMED_PILOT_DOCTOR_ID)
      ? env.MEMED_PILOT_DOCTOR_ID : null;
    const admin = createAstroAdminClient(locals.runtime?.env);
    const doctorResult = pilotId
      ? await admin.from('doctors')
        .select('id, user_id, active, license_type, license_number, uf_brazil, cpf')
        .eq('id', pilotId).maybeSingle()
      : { data: null, error: null };
    if (doctorResult.error) return serviceUnavailable('memed_pilot_readiness_unavailable');
    const doctor = doctorResult.data;
    let readiness = assessMemedPilotReadiness({
      doctor: null, licenses: [], profile: null, privateCpf: null,
    });
    if (doctor) {
      const [licensesResult, profileResult, privateCpf] = await Promise.all([
        admin.from('doctor_licenses')
          .select('license_number, uf_brazil, license_type, status, cfm_validation_status, cfm_evidence_path, cfm_review_notes, cfm_reviewed_by, cfm_reviewed_at, cfm_last_checked_at')
          .eq('doctor_id', doctor.id).eq('license_type', 'CRM').limit(20),
        admin.from('profiles').select('first_name, last_name, cpf')
          .eq('user_id', doctor.user_id).maybeSingle(),
        getMemedDoctorCpf(admin, doctor.id),
      ]);
      if (licensesResult.error || profileResult.error) {
        return serviceUnavailable('memed_pilot_readiness_unavailable');
      }
      readiness = assessMemedPilotReadiness({
        doctor,
        licenses: licensesResult.data ?? [],
        profile: profileResult.data,
        privateCpf,
      });
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/vnd.api+json', 'Cache-Control': 'no-cache' },
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    const result = await response.json() as { success?: Array<{ code?: unknown }> };
    const accepted = response.ok && Array.isArray(result.success)
      && result.success.some((entry) => entry.code === 'chave-valida');
    // Do not return any provider response body or secret to the caller.
    const health = jsonOk({ provider: 'memed', environment: 'production',
      credentialsAccepted: accepted, providerStatus: response.status,
      issuanceEnabled: env?.MEMED_RX_ENABLED === 'true',
      pilotConfigured: pilotId !== null,
      pilotReadiness: readiness,
      scriptConfigured: env?.MEMED_SCRIPT_URL === 'https://partners.memed.com.br/integration.js',
      readyForControlledPilot: accepted && readiness.readyForPilot
        && env?.MEMED_SCRIPT_URL === 'https://partners.memed.com.br/integration.js',
      // A production clinical release additionally requires a clinician-led
      // signed-PDF and patient-delivery verification; preflight is not issuance.
      clinicalEndToEndVerified: false });
    health.headers.set('Cache-Control', 'no-store, private');
    return health;
  } catch {
    return serviceUnavailable('memed_provider_unreachable');
  }
};

