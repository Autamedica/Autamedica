import { getCorsHeaders, jsonResponse, requireAuth } from '../_shared/auth-helpers.ts';
import { withEdgeSentry } from '../_shared/sentry.ts';

type JsonObject = Record<string, unknown>;

const digits = (value: unknown): string => String(value ?? '').replace(/\D/g, '');

function validCpf(value: string): boolean {
  const cpf = digits(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let length = 9; length <= 10; length++) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const digit = (sum * 10) % 11;
    if ((digit === 10 ? 0 : digit) !== Number(cpf[length])) return false;
  }
  return true;
}

function errorResponse(code: string, status: number, cors: Record<string, string>) {
  return jsonResponse({ success: false, code, error: code }, status, cors);
}

async function exists(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<boolean> {
  try {
    const result = await query;
    return !result.error && Boolean(result.data);
  } catch {
    return false;
  }
}

/**
 * In-call Android gateway. Creates a draft owned by the authenticated doctor,
 * then delegates the only issuance/signing operation to the country-aware Web
 * PAdES/Farmalink issuer. This function never signs PDFs or fabricates CUIR.
 */
async function issuePrescriptionHandler(req: Request): Promise<Response> {
  const cors = getCorsHeaders(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return errorResponse('METHOD_NOT_ALLOWED', 405, cors);

  try {
    const { user, serviceClient } = await requireAuth(req, cors);
    const body = await req.json().catch(() => null) as JsonObject | null;
    if (!body || Array.isArray(body) || typeof body !== 'object') {
      return errorResponse('INVALID_JSON', 400, cors);
    }

    const countryCode = String(body.countryCode ?? body.country_code ?? '').trim().toUpperCase();
    if (countryCode !== 'AR' && countryCode !== 'BR') {
      return errorResponse('COUNTRY_REQUIRED', 422, cors);
    }

    const { data: profile, error: profileError } = await serviceClient
      .from('profiles').select('role,active,sss_validation_status')
      .eq('user_id', user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.role !== 'doctor' || profile.active === false) {
      return errorResponse('FORBIDDEN_ROLE', 403, cors);
    }

    const { data: doctor, error: doctorError } = await serviceClient
      .from('doctors')
      .select('id,user_id,active,license_type,license_number,uf_brazil,care_country,cpf,refeps_id')
      .eq('user_id', user.id).maybeSingle();
    if (doctorError) throw doctorError;
    if (!doctor || doctor.active !== true) return errorResponse('DOCTOR_INACTIVE', 403, cors);
    if (body.doctorId && body.doctorId !== doctor.id) return errorResponse('DOCTOR_MISMATCH', 403, cors);
    if (body.doctor_id && body.doctor_id !== doctor.id) return errorResponse('DOCTOR_MISMATCH', 403, cors);

    if (countryCode === 'AR') {
      if (doctor.care_country && doctor.care_country !== 'AR') return errorResponse('DOCTOR_COUNTRY_MISMATCH', 403, cors);
      if (!['MN', 'MP'].includes(String(doctor.license_type))) return errorResponse('ARGENTINE_LICENSE_REQUIRED', 422, cors);
      if (!String(doctor.refeps_id ?? '').trim()) return errorResponse('REFEPS_REQUIRED', 422, cors);
      if (!['valid', 'exempt'].includes(String(profile.sss_validation_status ?? ''))) {
        return errorResponse('SSS_VALIDATION_REQUIRED', 422, cors);
      }
    } else {
      // Brazilian physicians must never be sent to the Argentine SISA/REFEPS edge.
      if (doctor.care_country && doctor.care_country !== 'BR') return errorResponse('DOCTOR_COUNTRY_MISMATCH', 403, cors);
      if (doctor.license_type !== 'CRM' || !/^[A-Z]{2}$/.test(String(doctor.uf_brazil ?? ''))) {
        return errorResponse('CRM_UF_REQUIRED', 422, cors);
      }
      if (!validCpf(digits(doctor.cpf))) return errorResponse('BR_DOCTOR_CPF_REQUIRED', 422, cors);
      const { data: licenses, error: licenseError } = await serviceClient
        .from('doctor_licenses')
        .select('license_number,uf_brazil,status,cfm_validation_status,cfm_evidence_path,cfm_review_notes,cfm_reviewed_by,cfm_reviewed_at,cfm_last_checked_at,license_type')
        .eq('doctor_id', doctor.id).eq('license_type', 'CRM')
        .eq('status', 'active').eq('cfm_validation_status', 'valid').limit(20);
      if (licenseError) throw licenseError;
      const crm = digits(doctor.license_number);
      const approved = (licenses ?? []).some((license: JsonObject) =>
        license.license_type === 'CRM'
        && digits(license.license_number) === crm
        && String(license.uf_brazil ?? '').toUpperCase() === String(doctor.uf_brazil).toUpperCase()
        && Boolean(String(license.cfm_evidence_path ?? '').trim())
        && String(license.cfm_review_notes ?? '').trim().length >= 10
        && Boolean(license.cfm_reviewed_by && license.cfm_reviewed_at && license.cfm_last_checked_at)
      );
      if (!approved) return errorResponse('CFM_LICENSE_NOT_VERIFIED', 403, cors);
    }

    const patientId = String(body.patientId ?? body.patient_id ?? '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(patientId)) {
      return errorResponse('PATIENT_REQUIRED', 422, cors);
    }
    const { data: patient, error: patientError } = await serviceClient
      .from('patients').select('id,user_id,care_country,cpf')
      .eq('id', patientId).maybeSingle();
    if (patientError) throw patientError;
    if (!patient) return errorResponse('PATIENT_NOT_FOUND', 404, cors);
    if (patient.care_country !== countryCode) return errorResponse('PATIENT_COUNTRY_MISMATCH', 409, cors);
    if (countryCode === 'BR' && !validCpf(digits(patient.cpf))) {
      const { data: privateIdentity } = await serviceClient
        .from('patient_private_identities')
        .select('document_number')
        .eq('patient_id', patientId)
        .eq('doctor_id', doctor.id)
        .eq('document_type', 'CPF')
        .maybeSingle();
      if (!validCpf(digits(privateIdentity?.document_number))) {
        return errorResponse('BR_PATIENT_CPF_REQUIRED', 422, cors);
      }
    }

    const [directLink, careTeam, appointment, dispatch] = await Promise.all([
      exists(serviceClient.from('doctor_patient').select('patient_id')
        .eq('doctor_id', doctor.id).eq('patient_id', patientId).limit(1).maybeSingle()),
      exists(serviceClient.from('patient_care_team').select('patient_id')
        .eq('doctor_id', doctor.id).eq('patient_id', patientId).eq('active', true).limit(1).maybeSingle()),
      exists(serviceClient.from('appointments').select('id')
        .eq('doctor_id', doctor.id).eq('patient_id', patientId).limit(1).maybeSingle()),
      exists(serviceClient.from('pharmacy_dispatch_requests').select('patient_id')
        .eq('assigned_doctor_id', doctor.id).eq('patient_id', patientId)
        .in('status', ['matched', 'in_call', 'transferring', 'transferred', 'completed']).limit(1).maybeSingle()),
    ]);
    if (!directLink && !careTeam && !appointment && !dispatch) {
      return errorResponse('DOCTOR_PATIENT_ACCESS_REQUIRED', 403, cors);
    }

    const clinicalData = (body.clinicalData ?? body.clinical_data) as JsonObject | undefined;
    const items = (body.items ?? clinicalData?.items) as unknown;
    if (!clinicalData || typeof clinicalData !== 'object' || !Array.isArray(items) || items.length < 1 || items.length > 3) {
      return errorResponse('CLINICAL_DATA_INVALID', 422, cors);
    }
    const diagnosis = String(body.diagnosis ?? clinicalData.diagnosis ?? '').trim();
    if (!diagnosis) return errorResponse('DIAGNOSIS_REQUIRED', 422, cors);

    const normalizedClinicalData = {
      ...clinicalData,
      diagnosis,
      items,
      country_code: countryCode,
      notes: body.notes ?? clinicalData.notes ?? null,
    };
    const { data: draft, error: insertError } = await serviceClient
      .from('prescriptions')
      .insert({
        doctor_id: doctor.id,
        patient_id: patientId,
        status: 'draft',
        country_code: countryCode,
        prescription_model_br: countryCode === 'BR' ? 'simples' : null,
        vendor_name: 'autamedica_pending_issuance',
        clinical_data: normalizedClinicalData,
      })
      .select('id').single();
    if (insertError) throw insertError;

    const webBase = (Deno.env.get('AUTAMEDICA_WEB_URL') || 'https://www.autamedica.com').replace(/\/$/, '');
    const authorization = req.headers.get('Authorization');
    if (!authorization) return errorResponse('AUTH_REQUIRED', 401, cors);
    const issueResponse = await fetch(
      `${webBase}/api/doctors/prescriptions/${draft.id}/issue`,
      {
        method: 'POST',
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'android_in_call' }),
      },
    );
    const issueBody = await issueResponse.json().catch(() => null) as JsonObject | null;
    if (!issueResponse.ok || issueBody?.success !== true || !issueBody.data) {
      const errorObj = (issueBody?.error && typeof issueBody.error === 'object' && !Array.isArray(issueBody.error))
        ? (issueBody.error as JsonObject)
        : null;
      const resolvedCode = String(
        errorObj?.message
          ?? (typeof issueBody?.error === 'string' ? issueBody.error : null)
          ?? issueBody?.code
          ?? 'ISSUER_REJECTED',
      );
      const resolvedDetails = typeof errorObj?.details === 'string' ? errorObj.details : undefined;
      console.error('[issue-prescription] country issuer rejected draft', {
        countryCode, status: issueResponse.status,
        code: resolvedCode,
      });
      return jsonResponse({
        success: false,
        code: resolvedCode,
        ...(resolvedDetails ? { details: resolvedDetails } : {}),
        prescriptionId: draft.id,
      }, issueResponse.status >= 500 ? 502 : (issueResponse.status === 400 ? 400 : 409), cors);
    }

    const issued = issueBody.data as JsonObject;
    if (issued.id !== draft.id || issued.status !== 'active' || !issued.signedPdfUrl || !issued.cuir || !issued.qrContent) {
      return jsonResponse({ success: false, code: 'ISSUER_RESPONSE_INCOMPLETE' }, 502, cors);
    }
    return jsonResponse({
      success: true,
      data: {
        id: issued.id,
        status: issued.status,
        cuir: issued.cuir,
        signed_pdf_url: issued.signedPdfUrl,
        qr_code_content: issued.qrContent,
        country_code: countryCode,
      },
    }, 200, cors);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('[issue-prescription] issuance gateway failed', {
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    return errorResponse('INTERNAL_ERROR', 500, cors);
  }
}

export const handler = withEdgeSentry('issue-prescription', issuePrescriptionHandler);

if (import.meta.main) {
  Deno.serve(handler);
}
