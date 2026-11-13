/**
 * POST /api/admin/doctors/license-verify-live
 * Performs a live verification of a doctor's license against the national REFEPS registry
 * via the Bus de Interoperabilidad. Automatically approves the license if verified.
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { createAstroAdminClient } from '@/lib/supabase';
import { resolveBusTokenSecret, resolveBusDomainUrl } from '@/lib/runtime-env';
import { RefepsApiValidator } from '@autamedica/prescriptions';
import { badRequest, internalError, jsonOk, jsonFail, unauthorized } from '@/lib/api-helpers';

type RequestBody = {
  doctorId?: string;
  userId?: string;
  persist?: boolean;
  matricula?: string;
  jurisdiction?: string;
};

// Validates that the caller has administrative privileges
async function assertAdmin(
  request: Request,
  admin: ReturnType<typeof createAstroAdminClient>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  locals?: any,
): Promise<{ ok: boolean; userId?: string }> {
  // 1. Try Astro's server-side verified locals session
  if (locals?.session?.user) {
    const userId = locals.session.user.id;
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    if (profile?.role && ['admin', 'platform_admin', 'organization_admin'].includes(profile.role)) {
      return { ok: true, userId };
    }
  }

  // 2. Fallback to Authorization Header token
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return { ok: false };

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { ok: false };

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('user_id', data.user.id)
    .maybeSingle();

  if (!profile?.role || !['admin', 'platform_admin', 'organization_admin'].includes(profile.role)) {
    return { ok: false };
  }

  return { ok: true, userId: data.user.id };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function firstText(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

const CANONICAL_VERIFICATION_URL = 'https://www.autamedica.com/api/admin/doctors/license-verify-live';
const PROXY_HOSTS = new Set([
  'autamedica.com', 'autamedica-admin.pages.dev', 'autamedica-admin-5r9.pages.dev',
  'doctor.autamedica.com', 'autamedica-doctors-az6.pages.dev',
]);

async function forwardOfficialVerification(request: Request, body: RequestBody): Promise<Response> {
  // The canonical middleware rejects empty User-Agent values before authentication.
  const headers = new Headers({
    'Content-Type': 'application/json',
    'User-Agent': 'AutaMedica-REFEPS-Proxy/1.0',
  });
  for (const name of ['authorization', 'cookie']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50_000);
  let upstreamStatus: number | undefined;
  let upstreamContentType: string | null = null;
  try {
    // Fixed first-party destination; its backend authenticates and authorizes the caller.
    // No service credential or caller-selected destination is forwarded.
    const response = await fetch(CANONICAL_VERIFICATION_URL, {
      method: 'POST', headers, body: JSON.stringify(body), redirect: 'manual',
      signal: controller.signal,
    });
    upstreamStatus = response.status;
    upstreamContentType = response.headers.get('Content-Type');
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || !('success' in payload)
      || typeof payload.success !== 'boolean' || (response.status >= 300 && response.status < 400)) {
      throw new Error('REFEPS_PROXY_INVALID_RESPONSE');
    }
    return new Response(JSON.stringify(payload), {
      status: response.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch {
    logger.warn('[license-verify-live] Canonical proxy incomplete', {
      upstreamStatus, upstreamContentType, timedOut: controller.signal.aborted,
    });
    return jsonFail('SERVICE_UNAVAILABLE',
      body.persist === false
        ? 'No se pudo completar la consulta oficial de REFEPS. Intentá nuevamente.'
        : 'No se pudo confirmar si la validación se guardó. Actualizá la ficha antes de reintentar.',
      503, { reason: controller.signal.aborted ? 'REFEPS_PROXY_TIMEOUT' : 'REFEPS_PROXY_FAILED' });
  } finally {
    clearTimeout(timeout);
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  let body: RequestBody;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return badRequest('invalid JSON object');
    const input = parsed as RequestBody;
    if (input.persist !== undefined && typeof input.persist !== 'boolean') return badRequest('persist must be boolean');
    if (input.matricula !== undefined && (!isNonEmptyString(input.matricula) || input.matricula.length > 128)) return badRequest('invalid matricula');
    if (input.jurisdiction !== undefined && (typeof input.jurisdiction !== 'string' || input.jurisdiction.length > 100)) return badRequest('invalid jurisdiction');
    body = {
      doctorId: isNonEmptyString(input.doctorId) ? input.doctorId.trim() : undefined,
      userId: isNonEmptyString(input.userId) ? input.userId.trim() : undefined,
      persist: input.persist,
      matricula: input.matricula?.trim(),
      jurisdiction: input.jurisdiction?.trim() || undefined,
    };
  } catch {
    return badRequest('invalid JSON');
  }
  if (!body.doctorId && !body.userId) return badRequest('doctorId or userId required');

  const tokenSecret = resolveBusTokenSecret(locals.runtime?.env);
  const domainUrl = resolveBusDomainUrl(locals.runtime?.env);
  if (!tokenSecret || !domainUrl) {
    if (PROXY_HOSTS.has(new URL(request.url).hostname)) return forwardOfficialVerification(request, body);
    return jsonFail('SERVICE_UNAVAILABLE',
      'La conexión con REFEPS no está configurada en este portal. No se modificó la validación.',
      503, { reason: 'REFEPS_CREDENTIALS_MISSING' });
  }

  const admin = createAstroAdminClient(locals.runtime?.env);
  const auth = await assertAdmin(request, admin, locals);
  if (!auth.ok || !auth.userId) return unauthorized('admin role required');

  try {
    // 1. Fetch the target doctor's details from the database
    const doctorQuery = admin
      .from('doctors')
      .select('id, user_id, license_number, enrollment_jurisdiction, enrollment_entity, specialty, refeps_id');

    const targetUserId = body.userId?.trim();
    const targetDoctorId = body.doctorId?.trim();

    const { data: doctor, error: doctorError } = targetDoctorId
      ? await doctorQuery.eq('id', targetDoctorId).maybeSingle()
      : await doctorQuery.eq('user_id', targetUserId ?? '').maybeSingle();

    if (doctorError) throw doctorError;
    if (!doctor) return badRequest('doctor not found');

    const matricula = body.matricula ?? doctor.license_number;
    if (!isNonEmptyString(matricula)) {
      return badRequest('doctor does not have a license number registered');
    }

    const { data: doctorProfile, error: profileError } = await admin.from('profiles')
      .select('first_name, last_name').eq('user_id', doctor.user_id).maybeSingle();
    if (profileError) throw profileError;
    if (!isNonEmptyString(doctorProfile?.first_name) || !isNonEmptyString(doctorProfile?.last_name)) {
      return jsonFail('VALIDATION', 'Completá el nombre y apellido del médico para contrastar la matrícula con REFEPS. No se modificó la validación.', 422,
        { reason: 'REFEPS_PROFILE_NAME_REQUIRED' });
    }

    // Determine matrícula type (MN vs MP)
    // If the enrollment entity or jurisdiction suggests a provincial registration, it is MP, otherwise MN
    const requestedProvince = body.jurisdiction ?? doctor.enrollment_jurisdiction ?? undefined;
    const provinceKey = requestedProvince?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const province = provinceKey && ['caba', 'capital federal', 'ciudad autonoma de buenos aires'].includes(provinceKey)
      ? 'CABA' : requestedProvince;
    const isProvincial = isNonEmptyString(province) && province !== 'CABA';
    const type: 'MN' | 'MP' = isProvincial ? 'MP' : 'MN';

    // 2. Resolve credentials for the Bus de Interoperabilidad
    logger.info('[license-verify-live] Running verification', {
      doctorId: doctor.id,
      matricula,
      type,
      province,
      hasLiveCredentials: !!tokenSecret && !!domainUrl,
      persist: body.persist !== false,
    });

    // 3. Query the official registry with its own identifier, never a local approval.
    const validator = new RefepsApiValidator({
      baseUrl: 'https://bus.msal.gob.ar',
      domainTokenSecret: tokenSecret,
      domainUrl: domainUrl,
      refepsId: doctor.refeps_id ?? undefined,
      discoverByMatricula: true,
      expectedName: `${doctorProfile.first_name} ${doctorProfile.last_name}`,
    });

    // 4. Perform the query
    const verification = await validator.validateMatricula(matricula, type, province);

    const checkedAt = new Date().toISOString();
    let finalStatus: 'valid' | 'rejected' | 'pending_review' = 'pending_review';

    if (verification.isValid) {
      finalStatus = 'valid';
    } else if (verification.registrationStatus === 'not_found' || verification.registrationStatus === 'revoked') {
      finalStatus = 'rejected';
    }

    const persist = body.persist !== false;
    const source = verification.source ?? 'unverified';

    // Local doctor records and offline mock data cannot establish professional
    // accreditation. Never persist a medical license decision from those sources.
    if (source !== 'national_refeps_api') {
      logger.warn('[license-verify-live] Official REFEPS check unavailable; leaving license unchanged', {
        doctorId: doctor.id,
        source,
      });
      return jsonFail('SERVICE_UNAVAILABLE',
        'No se obtuvo una respuesta oficial de REFEPS. La validación anterior se conserva.', 503,
        { reason: 'REFEPS_UNVERIFIED_SOURCE' });
    }

    const registeredSpecialty = firstText(verification.specialty);
    const practitionerId = firstText(verification.practitionerId);
    const validatedLicense = firstText(
      verification.matriculaNumber,
      verification.qualifications?.flatMap((qualification) => qualification.identifiers ?? [])
        .find((identifier) => identifier.value)?.value,
    );

    // 5. Update the doctor's profile status in the database
    if (persist) {
      // Persist the required license before setting SSS=valid; otherwise the
      // clinical dispatch gate can stay closed while the admin reports success.
      const { error: licenseError } = await admin
        .from('doctor_licenses')
        .upsert(
          {
            doctor_id: doctor.id,
            license_number: validatedLicense ?? matricula,
            license_type: type,
            province: province ?? null,
            status: verification.registrationStatus === 'suspended' ? 'suspended' : finalStatus === 'valid' ? 'active' : 'inactive',
            issued_by: doctor.enrollment_entity ?? null,
          },
          { onConflict: 'doctor_id,province,license_number' },
        );

      if (licenseError) {
        // Never report an official approval as persisted without its required license row.
        logger.error('[license-verify-live] Structured license persistence failed', licenseError);
        throw licenseError;
      }

      const profileUpdates: Record<string, string | null> = {
        sss_validation_status: finalStatus,
        sss_last_checked_at: checkedAt,
      };

      if (registeredSpecialty) profileUpdates.especialidad_registrada = registeredSpecialty;
      if (validatedLicense) profileUpdates.matricula_nacional = validatedLicense;

      const { error: updateError } = await admin
        .from('profiles')
        .update(profileUpdates)
        .eq('user_id', doctor.user_id);

      if (updateError) throw updateError;

      if (practitionerId) {
        const { error: doctorUpdateError } = await admin
          .from('doctors')
          .update({
            refeps_id: practitionerId,
            ...(validatedLicense ? { license_number: validatedLicense } : {}),
            ...(province ? { enrollment_jurisdiction: province } : {}),
          })
          .eq('id', doctor.id);

        if (doctorUpdateError) throw doctorUpdateError;
      }


      if (registeredSpecialty) {
        const { error: specialtyError } = await admin
          .from('doctor_specialties')
          .upsert(
            {
              doctor_id: doctor.id,
              specialty_name: registeredSpecialty,
              certification_entity: source,
            },
            { onConflict: 'doctor_id,specialty_name' },
          );

        if (specialtyError) {
          logger.warn('[license-verify-live] structured specialty upsert skipped', specialtyError);
        }
      }
    }

    logger.info('[license-verify-live] Completed verification', {
      doctorId: doctor.id,
      targetUserId: doctor.user_id,
      finalStatus,
      signerFullName: verification.fullName,
      isValid: verification.isValid,
    });

    return jsonOk({
      doctorId: doctor.id,
      userId: doctor.user_id,
      matricula: validatedLicense ?? matricula,
      type,
      province,
      fullName: verification.fullName || doctor.specialty || '',
      isValid: verification.isValid,
      status: finalStatus,
      checkedAt,
      source,
      practitionerId,
      registeredSpecialty,
      registrationStatus: verification.registrationStatus,
      qualifications: verification.qualifications ?? [],
    });
  } catch (err) {
    const reason = err instanceof Error && 'code' in err && typeof err.code === 'string'
      ? err.code : '';
    const messages: Record<string, string> = {
      REFEPS_CREDENTIALS_MISSING: 'La conexión con REFEPS no está configurada en este portal.',
      REFEPS_ID_REQUIRED: 'Falta un identificador REFEPS válido del profesional; la matrícula por sí sola no permite esta consulta.',
      REFEPS_AUTH_FAILED: 'REFEPS no autorizó la conexión de AutaMedica. Es necesario revisar sus credenciales y permisos.',
      REFEPS_AUTH_TOKEN_MISSING: 'La autenticación de REFEPS no devolvió una autorización válida.',
      REFEPS_LOOKUP_FAILED: 'El registro oficial no pudo completar la consulta del profesional.',
      REFEPS_TIMEOUT: 'La consulta a REFEPS superó el tiempo de espera. Intentá nuevamente.',
      REFEPS_NETWORK_ERROR: 'No se pudo establecer conexión con REFEPS. Intentá nuevamente.',
      REFEPS_INVALID_RESPONSE: 'REFEPS devolvió una respuesta que no permite comprobar la matrícula.',
      REFEPS_IDENTITY_MISMATCH: 'La respuesta de REFEPS no coincide de forma inequívoca con el identificador del profesional.',
      REFEPS_LICENSE_MISMATCH: 'No se pudo confirmar la matrícula médica y su jurisdicción en la respuesta de REFEPS.',
      REFEPS_QUALIFICATIONS_MISSING: 'REFEPS encontró al profesional, pero no devolvió sus matrículas y profesiones.',
      REFEPS_LICENSE_NUMBER_MISMATCH: 'REFEPS encontró al profesional, pero no devolvió el número de matrícula registrado en esta ficha.',
      REFEPS_LICENSE_JURISDICTION_MISMATCH: 'La matrícula figura en REFEPS, pero su organismo emisor no coincide con la jurisdicción registrada o no pudo reconocerse.',
      REFEPS_MEDICAL_PROFESSION_UNCONFIRMED: 'La matrícula y su emisor coinciden, pero REFEPS no confirmó la profesión médica con un código reconocido.',
      REFEPS_LICENSE_STATUS_UNKNOWN: 'REFEPS no informó de forma explícita la habilitación de esta matrícula.',
      REFEPS_LICENSE_FORMAT: 'Ingresá una matrícula con formato válido, con o sin prefijo MN o MP.',
      REFEPS_DISCOVERY_UNAVAILABLE: 'El buscador oficial de REFEPS no pudo completar la búsqueda por matrícula. Intentá nuevamente.',
      REFEPS_DISCOVERY_INVALID_RESPONSE: 'El buscador oficial de REFEPS devolvió un formato que no permite identificar al profesional.',
      REFEPS_DISCOVERY_NOT_FOUND: 'No se encontró una matrícula médica con ese número y jurisdicción en el buscador oficial.',
      REFEPS_DISCOVERY_IDENTITY_MISMATCH: 'La matrícula encontrada en REFEPS no coincide con el nombre y apellido de esta ficha.',
      REFEPS_DISCOVERY_AMBIGUOUS: 'La matrícula coincide con más de un profesional. Revisá el nombre y la jurisdicción de esta ficha.',
    };
    if (Object.hasOwn(messages, reason)) {
      logger.warn('[license-verify-live] Official verification incomplete', { reason });
      const inputError = ['REFEPS_ID_REQUIRED', 'REFEPS_LICENSE_FORMAT', 'REFEPS_DISCOVERY_NOT_FOUND',
        'REFEPS_DISCOVERY_IDENTITY_MISMATCH', 'REFEPS_DISCOVERY_AMBIGUOUS'].includes(reason);
      const issuerSummary = reason === 'REFEPS_LICENSE_JURISDICTION_MISMATCH'
        && err instanceof Error && 'issuerSummary' in err && typeof err.issuerSummary === 'string'
        ? err.issuerSummary.replace(/[^\p{L}\p{N} .,'()/-]/gu, ' ').slice(0, 220).trim() : '';
      const professionSummary = reason === 'REFEPS_MEDICAL_PROFESSION_UNCONFIRMED'
        && err instanceof Error && 'professionSummary' in err && typeof err.professionSummary === 'string'
        ? err.professionSummary.replace(/[^\p{L}\p{N} .,:;_/-]/gu, ' ').slice(0, 900).trim() : '';
      return jsonFail(inputError ? 'VALIDATION' : 'SERVICE_UNAVAILABLE',
        `${messages[reason]}${issuerSummary ? ` Emisor informado: ${issuerSummary}.` : ''}${professionSummary ? ` Profesión informada: ${professionSummary}.` : ''} No se modificó la validación.`, inputError ? 422 : 503,
        { reason });
    }
    logger.error('[license-verify-live] Critical failure', err);
    return internalError('No se pudo completar la verificación de la matrícula.');
  }
};

