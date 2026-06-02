/**
 * POST /api/admin/doctors/license-verify-live
 * Performs a live verification of a doctor's license against the national REFEPS registry
 * via the Bus de Interoperabilidad. Automatically approves the license if verified.
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { createAstroAdminClient } from '@/lib/supabase';
import { resolveBusTokenSecret, resolveBusDomainUrl } from '@/lib/runtime-env';
import { RefepsApiValidator, LocalRefepsValidator } from '@autamedica/prescriptions';
import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers';

type RequestBody = {
  doctorId?: string;
  userId?: string;
  persist?: boolean;
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

export const POST: APIRoute = async ({ request, locals }) => {
  const admin = createAstroAdminClient(locals.runtime?.env);
  const auth = await assertAdmin(request, admin, locals);
  if (!auth.ok || !auth.userId) return unauthorized('admin role required');

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return badRequest('invalid JSON');
  }

  if (!isNonEmptyString(body.doctorId) && !isNonEmptyString(body.userId)) {
    return badRequest('doctorId or userId required');
  }

  try {
    // 1. Fetch the target doctor's details from the database
    const doctorQuery = admin
      .from('doctors')
      .select('id, user_id, license_number, enrollment_jurisdiction, enrollment_entity, specialty');

    const targetUserId = body.userId?.trim();
    const targetDoctorId = body.doctorId?.trim();

    const { data: doctor, error: doctorError } = targetDoctorId
      ? await doctorQuery.eq('id', targetDoctorId).maybeSingle()
      : await doctorQuery.eq('user_id', targetUserId ?? '').maybeSingle();

    if (doctorError) throw doctorError;
    if (!doctor) return badRequest('doctor not found');

    const matricula = doctor.license_number;
    if (!isNonEmptyString(matricula)) {
      return badRequest('doctor does not have a license number registered');
    }

    // Determine matrícula type (MN vs MP)
    // If the enrollment entity or jurisdiction suggests a provincial registration, it is MP, otherwise MN
    const isProvincial = isNonEmptyString(doctor.enrollment_jurisdiction) && doctor.enrollment_jurisdiction !== 'CABA';
    const type: 'MN' | 'MP' = isProvincial ? 'MP' : 'MN';
    const province = doctor.enrollment_jurisdiction ?? undefined;

    // 2. Resolve credentials for the Bus de Interoperabilidad
    const tokenSecret = resolveBusTokenSecret(locals.runtime?.env);
    const domainUrl = resolveBusDomainUrl(locals.runtime?.env);

    logger.info('[license-verify-live] Running verification', {
      doctorId: doctor.id,
      matricula,
      type,
      province,
      hasLiveCredentials: !!tokenSecret && !!domainUrl,
      persist: body.persist !== false,
    });

    // 3. Initialize validators (with local DB check as a fallback)
    const localValidator = new LocalRefepsValidator(admin);
    const validator = new RefepsApiValidator({
      baseUrl: 'https://bus.msal.gob.ar',
      domainTokenSecret: tokenSecret,
      domainUrl: domainUrl,
      fallbackValidator: localValidator,
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
    const source = verification.source ?? (tokenSecret && domainUrl ? 'national_refeps_api' : 'local_database_fallback');
    const registeredSpecialty = firstText(verification.specialty);
    const practitionerId = firstText(verification.practitionerId);
    const validatedLicense = firstText(
      verification.matriculaNumber,
      verification.qualifications?.flatMap((qualification) => qualification.identifiers ?? [])
        .find((identifier) => identifier.value)?.value,
    );

    // 5. Update the doctor's profile status in the database
    if (persist) {
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
          })
          .eq('id', doctor.id);

        if (doctorUpdateError) throw doctorUpdateError;
      }

      const { error: licenseError } = await admin
        .from('doctor_licenses')
        .upsert(
          {
            doctor_id: doctor.id,
            license_number: matricula,
            license_type: type,
            province: province ?? null,
            status: verification.registrationStatus === 'suspended' ? 'suspended' : finalStatus === 'valid' ? 'active' : 'inactive',
            issued_by: doctor.enrollment_entity ?? null,
          },
          { onConflict: 'doctor_id,province,license_number' },
        );

      if (licenseError) {
        logger.warn('[license-verify-live] structured license upsert skipped', licenseError);
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
      matricula,
      type,
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
    logger.error('[license-verify-live] Critical failure', err);
    return internalError(err instanceof Error ? err.message : 'live license verification failed');
  }
};
