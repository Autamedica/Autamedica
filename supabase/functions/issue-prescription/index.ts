import { getCorsHeaders, jsonResponse, requireAuth } from '../_shared/auth-helpers.ts';

/**
 * LEGACY EDGE ISSUER — fail closed.
 *
 * This function historically minted its own CUIR, uploaded an unsigned PDF,
 * inserted ACT_DIGITAL_SIGNATURE and marked the prescription "sent". Neither
 * a PDF hash nor a CUIR proves a doctor's cryptographic signature, or approval
 * by Farmalink (AR) / Memed (BR).
 *
 * Keep authentication and professional checks for consistent denial. All
 * official issuance must move to the verified country-specific provider flow.
 * Never restore legacy PDF/CUIR writes behind a boolean environment flag.
 */
export async function handler(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse(
      { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
      405, corsHeaders,
    );
  }

  try {
    const { user, serviceClient } = await requireAuth(req, corsHeaders);

    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('role,active,sss_validation_status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.role !== 'doctor' || profile.active === false) {
      return jsonResponse(
        { error: 'User is not an authorized active doctor', code: 'FORBIDDEN_ROLE' },
        403, corsHeaders,
      );
    }

    const { data: doctor, error: doctorError } = await serviceClient
      .from('doctors')
      .select('id,user_id,active,refeps_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (doctorError) throw doctorError;
    if (!doctor || doctor.active === false) {
      return jsonResponse(
        { error: 'Active doctor record required', code: 'DOCTOR_INACTIVE' },
        403, corsHeaders,
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonResponse(
        { error: 'Invalid JSON payload', code: 'INVALID_JSON' },
        400, corsHeaders,
      );
    }

    // Jurisdiction must come explicitly from the actual patient encounter.
    const countryCode = typeof body.countryCode === 'string'
      ? body.countryCode.trim().toUpperCase()
      : '';
    if (countryCode !== 'AR' && countryCode !== 'BR') {
      return jsonResponse(
        { error: 'Explicit AR or BR clinical jurisdiction required', code: 'COUNTRY_REQUIRED' },
        422, corsHeaders,
      );
    }

    // Keep the pre-existing professional-eligibility checks. BR must never
    // inherit Argentine SSS/REFEPS validation from a default AR country.
    if (countryCode === 'AR') {
      if (!doctor.refeps_id || !doctor.refeps_id.trim()) {
        return jsonResponse(
          { error: 'Argentine REFEPS identification required', code: 'REFEPS_REQUIRED' },
          422, corsHeaders,
        );
      }
      if (!['valid', 'exempt'].includes(profile.sss_validation_status ?? '')) {
        return jsonResponse(
          { error: 'Argentine professional validation required', code: 'SSS_VALIDATION_REQUIRED' },
          422, corsHeaders,
        );
      }
    }

    // No database mutations, vendor calls, PDF generation, CUIR creation, or
    // signature audit events. The medical consultation itself is unaffected.
    return jsonResponse(
      {
        success: false,
        error: 'Official prescription issuance requires the validated provider for this country',
        code: 'OFFICIAL_ISSUANCE_PROVIDER_REQUIRED',
        countryCode,
      },
      409, corsHeaders,
    );
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('[issue-prescription] Request denied due to server error', {
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    return jsonResponse(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      500, corsHeaders,
    );
  }
}
