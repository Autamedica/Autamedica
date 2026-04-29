import { captureEdgeException, initEdgeSentry } from '../_shared/sentry.ts';
import { getCorsHeaders, jsonResponse, requireAuth } from '../_shared/auth-helpers.ts';

const SSS_RESOURCE_ID = '7964780d-13f0-4732-8164-603a397962fa';
const SSS_API_URL = 'https://datos.salud.gob.ar/api/3/action/datastore_search';
const SSS_TIMEOUT_MS = 8000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

interface VerifyRequest {
  dni: string;
  matricula: string;
}

interface SssLicenseRecord {
  numero_documento?: string | number;
  certificado_numero?: string | number;
  profesion?: string;
}

interface SssResponse {
  result?: {
    records?: SssLicenseRecord[];
  };
}

initEdgeSentry('verify-doctor-license');

function normalizeDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeMatricula(value: unknown): string {
  return normalizeText(value).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function getClientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const current = rateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  current.count += 1;
  return current.count > RATE_LIMIT_MAX_ATTEMPTS;
}

function enforceRateLimit(userId: string, ip: string): boolean {
  return isRateLimited(`user:${userId}`) || isRateLimited(`ip:${ip}`);
}

async function fetchSssRecords(dni: string): Promise<SssLicenseRecord[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SSS_TIMEOUT_MS);

  try {
    const queryUrl = `${SSS_API_URL}?resource_id=${SSS_RESOURCE_ID}&q=${encodeURIComponent(dni)}`;
    const response = await fetch(queryUrl, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`SSS API returned ${response.status}`);
    }

    const sssData = await response.json() as SssResponse;
    return sssData.result?.records ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' }, 405, corsHeaders);
  }

  try {
    const { user, serviceClient } = await requireAuth(req, corsHeaders);
    let body: Partial<VerifyRequest>;

    try {
      body = await req.json() as Partial<VerifyRequest>;
    } catch {
      return jsonResponse(
        { error: 'Invalid JSON body', code: 'VALIDATION_ERROR' },
        400,
        corsHeaders,
      );
    }

    const dni = normalizeDigits(body.dni);
    const matricula = normalizeMatricula(body.matricula);

    if (dni.length < 7 || dni.length > 9 || matricula.length < 3) {
      return jsonResponse(
        { error: 'DNI and matricula are required', code: 'VALIDATION_ERROR' },
        400,
        corsHeaders,
      );
    }

    const { data: doctor, error: doctorError } = await serviceClient
      .from('doctors')
      .select('id, user_id, license_number, active')
      .eq('user_id', user.id)
      .eq('active', true)
      .maybeSingle();

    if (doctorError) throw doctorError;

    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('role, active, sss_validation_status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (!doctor || profile?.role !== 'doctor' || profile?.active === false) {
      return jsonResponse(
        { error: 'doctor_profile_required', code: 'DOCTOR_PROFILE_REQUIRED' },
        403,
        corsHeaders,
      );
    }

    if (profile?.sss_validation_status === 'exempt') {
      return jsonResponse(
        {
          success: true,
          data: {
            status: 'exempt',
            profession: null,
            is_psychiatrist: false,
            checked_at: new Date().toISOString(),
          },
        },
        200,
        corsHeaders,
      );
    }

    if (normalizeMatricula(doctor.license_number) !== matricula) {
      return jsonResponse(
        { error: 'La matricula ingresada no coincide con tu perfil profesional.', code: 'LICENSE_PROFILE_MISMATCH' },
        403,
        corsHeaders,
      );
    }

    if (enforceRateLimit(user.id, getClientIp(req))) {
      return jsonResponse(
        { error: 'Too many verification attempts', code: 'RATE_LIMITED' },
        429,
        corsHeaders,
      );
    }

    const records = await fetchSssRecords(dni);
    const match = records.find((r) =>
      normalizeDigits(r.numero_documento) === dni &&
      normalizeMatricula(r.certificado_numero) === matricula
    );

    if (!match) {
      const { error: updateError } = await serviceClient.from('profiles').update({
        sss_validation_status: 'pending_review',
        sss_last_checked_at: new Date().toISOString(),
        especialidad_registrada: null,
        matricula_nacional: null,
      }).eq('user_id', user.id);

      if (updateError) throw updateError;

      return jsonResponse(
        {
          error: 'No pudimos validar automaticamente la matricula. Quedo pendiente de revision manual.',
          code: 'LICENSE_PENDING_REVIEW',
        },
        404,
        corsHeaders,
      );
    }

    const profesion = normalizeText(match.profesion);
    const normalizedProfesion = profesion.toLowerCase();
    const isPsychiatrist = normalizedProfesion.includes('psiquiatria') || normalizedProfesion.includes('psiquiatría');
    const checkedAt = new Date().toISOString();

    const { error: updateError } = await serviceClient.from('profiles').update({
      sss_validation_status: 'valid',
      especialidad_registrada: profesion || null,
      sss_last_checked_at: checkedAt,
      matricula_nacional: normalizeMatricula(match.certificado_numero),
    }).eq('user_id', user.id);

    if (updateError) throw updateError;

    return jsonResponse(
      {
        success: true,
        data: {
          status: 'valid',
          profession: profesion || null,
          is_psychiatrist: isPsychiatrist,
          checked_at: checkedAt,
        },
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    captureEdgeException(error, {
      layer: 'data-platform',
      surface: 'verify-doctor-license:unexpected',
      owner: 'Medical Board',
    });

    const isTimeout = error instanceof DOMException && error.name === 'AbortError';
    return jsonResponse(
      {
        error: isTimeout
          ? 'El registro nacional no respondio a tiempo. Proba nuevamente.'
          : 'Error interno al verificar la matricula.',
        code: isTimeout ? 'SSS_TIMEOUT' : 'INTERNAL_ERROR',
      },
      isTimeout ? 504 : 500,
      corsHeaders,
    );
  }
});
