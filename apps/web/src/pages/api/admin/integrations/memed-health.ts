import type { SupabaseClient } from '@supabase/supabase-js';
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
  const memedCredentialsConfigured = typeof apiKey === 'string' && apiKey.length > 0
    && typeof secretKey === 'string' && secretKey.length > 0
    && apiBase === 'https://api.memed.com.br/v1';
  const memedRxEnabled = env?.MEMED_RX_ENABLED === 'true';
  const memedMobileEnabled = env?.MEMED_MOBILE_ENABLED === 'true';
  const farmalinkEnabled = env?.FARMALINK_ENABLED === 'true';
  const farmalinkBaseUrlConfigured = typeof env?.FARMALINK_BASE_URL === 'string'
    && env.FARMALINK_BASE_URL.trim().length > 0;
  const farmalinkRequireExternalAc = env?.FARMALINK_REQUIRE_EXTERNAL_AC !== 'false';
  const farmalinkCredentialsConfigured = [
    env?.FARMALINK_OAUTH_USERNAME, env?.FARMALINK_OAUTH_PASSWORD,
    env?.FARMALINK_BASIC_USER, env?.FARMALINK_BASIC_PASSWORD,
  ].every((value) => typeof value === 'string' && value.length > 0);

  try {
    // Preflight is read-only; never creates a Memed user, prescription, or patient.
    const pilotId = typeof env?.MEMED_PILOT_DOCTOR_ID === 'string'
      && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(env.MEMED_PILOT_DOCTOR_ID)
      ? env.MEMED_PILOT_DOCTOR_ID : null;
    const admin = createAstroAdminClient(locals.runtime?.env);
    const { data: clinicalScope, error: clinicalScopeError } = await (admin as unknown as SupabaseClient)
      .from('platform_operational_domains')
      .select('clinical_status')
      .eq('scope_key', 'BR')
      .maybeSingle();
    if (clinicalScopeError) return serviceUnavailable('brazil_clinical_status_unavailable');
    const clinicalStatus = clinicalScope?.clinical_status?.toLowerCase() ?? null;
    const issuanceGovernanceEnabled = clinicalStatus !== 'disabled' && clinicalStatus !== 'suspended';
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

    // Validate partner credentials via a read-only GET lookup (mirrors scripts/ops/memed-preflight.mjs).
    // Never fail the entire governance health response if upstream Memed is unreachable;
    // return real runtime flags alongside providerReachable=false so admins always see truth.
    let providerReachable = false;
    let providerStatus: number | null = null;
    let accepted = false;

    if (memedCredentialsConfigured) {
      const probeExternalId = pilotId ?? 'autamedica-healthcheck-readonly';
      const url = new URL(`/v1/sinapse-prescricao/usuarios/${encodeURIComponent(probeExternalId)}`, 'https://api.memed.com.br');
      url.searchParams.set('api-key', apiKey);
      url.searchParams.set('secret-key', secretKey);

      try {
        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            Accept: 'application/vnd.api+json',
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'User-Agent': 'Autamedica-Memed-Health/1.0',
          },
          redirect: 'error',
          signal: AbortSignal.timeout(8000),
        });
        providerReachable = true;
        providerStatus = response.status;
        const raw = await response.text();
        let payload: {
          data?: { type?: unknown; attributes?: unknown };
          errors?: Array<{ detail?: unknown }>;
        } | null = null;
        try {
          payload = JSON.parse(raw) as typeof payload;
        } catch {
          payload = null;
        }
        const doctorFound = response.status === 200
          && payload?.data?.type === 'usuarios'
          && Boolean(payload?.data?.attributes && typeof payload.data.attributes === 'object');
        const doctorNotRegistered = response.status === 404
          && Array.isArray(payload?.errors)
          && payload.errors.some((entry) => /nenhum usu[aá]rio encontrado/i.test(String(entry?.detail ?? '')));
        accepted = Boolean(doctorFound || doctorNotRegistered);
      } catch {
        providerReachable = false;
        providerStatus = null;
        accepted = false;
      }
    }

    // Do not return any provider response body or secret to the caller.
    const health = jsonOk({ provider: 'memed', environment: 'production',
      credentialsConfigured: memedCredentialsConfigured,
      credentialsAccepted: accepted,
      providerReachable,
      providerStatus,
      flags: {
        MEMED_RX_ENABLED: memedRxEnabled,
        MEMED_MOBILE_ENABLED: memedMobileEnabled,
        FARMALINK_ENABLED: farmalinkEnabled,
      },
      effectiveFlags: {
        MEMED_RX_ENABLED: memedRxEnabled && accepted,
        MEMED_MOBILE_ENABLED: memedMobileEnabled && memedRxEnabled && accepted,
        FARMALINK_ENABLED: farmalinkEnabled && farmalinkBaseUrlConfigured && farmalinkCredentialsConfigured,
      },
      farmalink: {
        enabled: farmalinkEnabled && farmalinkBaseUrlConfigured && farmalinkCredentialsConfigured,
        baseUrlConfigured: farmalinkBaseUrlConfigured,
        credentialsConfigured: farmalinkCredentialsConfigured,
        requireExternalAc: farmalinkRequireExternalAc,
      },
      issuanceEnabled: memedRxEnabled,
      clinicalStatus,
      issuanceGovernanceEnabled,
      pilotConfigured: pilotId !== null,
      pilotReadiness: readiness,
      scriptConfigured: env?.MEMED_SCRIPT_URL === 'https://partners.memed.com.br/integration.js',
      readyForControlledPilot: accepted && issuanceGovernanceEnabled && readiness.readyForPilot
        && memedRxEnabled
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

