import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { createAstroAdminClient } from '@/lib/supabase';
import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers';

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

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const doctorId = params.id;
  if (!doctorId) return badRequest('doctorId parameter is required');

  const admin = createAstroAdminClient(locals.runtime?.env);
  const auth = await assertAdmin(request, admin, locals);
  if (!auth.ok) return unauthorized('admin role required');

  interface UpdateDoctorBody {
    firstName?: string;
    lastName?: string;
    phone?: string | null;
    role?: string;
    specialty?: string;
    subspecialty?: string | null;
    licenseNumber?: string;
    yearsExperience?: string;
    consultationFee?: string;
    enrollmentEntity?: string | null;
    enrollmentJurisdiction?: string | null;
    professionalAddress?: string | null;
    payoutCbu?: string | null;
    payoutAlias?: string | null;
    bio?: string | null;
    languages?: string[] | string | null;
    sssValidationStatus?: 'valid' | 'pending_review' | 'rejected' | 'exempt' | null;
    matriculaNacional?: string | null;
    especialidadRegistrada?: string | null;
    active?: boolean | string;
  }

  let body: UpdateDoctorBody;
  try {
    body = await request.json() as UpdateDoctorBody;
  } catch {
    return badRequest('invalid JSON');
  }

  const {
    firstName,
    lastName,
    phone,
    role: profileRole,
    specialty,
    subspecialty,
    licenseNumber,
    yearsExperience,
    consultationFee,
    enrollmentEntity,
    enrollmentJurisdiction,
    professionalAddress,
    payoutCbu,
    payoutAlias,
    bio,
    languages,
    sssValidationStatus,
    matriculaNacional,
    especialidadRegistrada,
    active,
  } = body;

  try {
    // 1. Fetch current doctor record to get user_id
    const { data: doctor, error: fetchErr } = await admin
      .from('doctors')
      .select('user_id')
      .eq('id', doctorId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!doctor) return badRequest('doctor not found');

    const userId = doctor.user_id;

    // 2. Update profiles table
    const profileUpdates: Record<string, string | null | undefined> = {};
    if (firstName !== undefined) profileUpdates.first_name = firstName;
    if (lastName !== undefined) profileUpdates.last_name = lastName;
    if (phone !== undefined) profileUpdates.phone = phone;
    if (profileRole !== undefined) profileUpdates.role = profileRole;
    if (sssValidationStatus !== undefined) profileUpdates.sss_validation_status = sssValidationStatus;
    if (matriculaNacional !== undefined) profileUpdates.matricula_nacional = matriculaNacional;
    if (especialidadRegistrada !== undefined) profileUpdates.especialidad_registrada = especialidadRegistrada;

    if (Object.keys(profileUpdates).length > 0) {
      const { error: profileErr } = await admin
        .from('profiles')
        .update(profileUpdates)
        .eq('user_id', userId);

      if (profileErr) {
        logger.error('[api/admin/doctors/[id]] Profile update failed', profileErr);
        throw profileErr;
      }
    }

    // 3. Update doctors table
    const doctorUpdates: Record<string, string | number | boolean | string[] | null | undefined> = {};
    if (specialty !== undefined) doctorUpdates.specialty = specialty;
    if (subspecialty !== undefined) doctorUpdates.subspecialty = subspecialty;
    if (licenseNumber !== undefined) doctorUpdates.license_number = licenseNumber;
    if (yearsExperience !== undefined) doctorUpdates.years_experience = parseInt(yearsExperience, 10);
    if (consultationFee !== undefined) doctorUpdates.consultation_fee = parseFloat(consultationFee);
    if (enrollmentEntity !== undefined) doctorUpdates.enrollment_entity = enrollmentEntity;
    if (enrollmentJurisdiction !== undefined) doctorUpdates.enrollment_jurisdiction = enrollmentJurisdiction;
    if (professionalAddress !== undefined) doctorUpdates.professional_address = professionalAddress;
    if (payoutCbu !== undefined) doctorUpdates.payout_cbu = payoutCbu;
    if (payoutAlias !== undefined) doctorUpdates.payout_alias = payoutAlias;
    if (bio !== undefined) doctorUpdates.bio = bio;
    if (languages !== undefined) {
      doctorUpdates.languages = Array.isArray(languages) ? languages : (languages ? [languages] : []);
    }
    if (active !== undefined) {
      doctorUpdates.active = active === true || active === 'true';
    }

    if (Object.keys(doctorUpdates).length > 0) {
      const { error: doctorErr } = await admin
        .from('doctors')
        .update(doctorUpdates)
        .eq('id', doctorId);

      if (doctorErr) {
        logger.error('[api/admin/doctors/[id]] Doctor update failed', doctorErr);
        throw doctorErr;
      }
    }

    logger.info('[api/admin/doctors/[id]] Doctor updated successfully', { doctorId, userId });

    // 4. Fetch the fully joined record and return
    const { data: finalDoctor, error: finalFetchErr } = await admin
      .from('doctors')
      .select(`
        id,
        user_id,
        specialty,
        subspecialty,
        license_number,
        years_experience,
        consultation_fee,
        refeps_id,
        enrollment_entity,
        enrollment_jurisdiction,
        professional_address,
        payout_cbu,
        payout_alias,
        signature_image_url,
        stamp_image_url,
        bio,
        languages,
        active,
        care_country,
        license_type,
        uf_brazil,
        created_at,
        updated_at,
        profile:profiles!inner(
          user_id,
          first_name,
          last_name,
          email,
          phone,
          avatar_url,
          role,
          sss_validation_status,
          sss_last_checked_at,
          especialidad_registrada,
          matricula_nacional
        )
      `)
      .eq('id', doctorId)
      .single();

    if (finalFetchErr) throw finalFetchErr;

    return jsonOk(finalDoctor);
  } catch (err) {
    logger.error(`[api/admin/doctors/[id]] PUT failed for doctorId ${doctorId}`, err);
    return internalError(err instanceof Error ? err.message : 'failed to update doctor');
  }
};

export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const doctorId = params.id;
  if (!doctorId) return badRequest('doctorId parameter is required');

  const admin = createAstroAdminClient(locals.runtime?.env);
  const auth = await assertAdmin(request, admin, locals);
  if (!auth.ok) return unauthorized('admin role required');

  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') || 'soft';

  try {
    // Check if the doctor exists first
    const { data: doctor, error: fetchErr } = await admin
      .from('doctors')
      .select('user_id')
      .eq('id', doctorId)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!doctor) return badRequest('doctor not found');

    const userId = doctor.user_id;

    if (mode === 'hard') {
      logger.info(`[api/admin/doctors/[id]] Attempting hard delete for doctorId ${doctorId}`);

      // Try physical deletion
      const { error: deleteErr } = await admin
        .from('doctors')
        .delete()
        .eq('id', doctorId);

      if (deleteErr) {
        logger.warn(`[api/admin/doctors/[id]] Hard delete failed due to constraints. Falling back to soft delete.`, deleteErr);
        
        // Fallback to Soft Delete if constraints block physical delete
        const { error: softErr } = await admin
          .from('doctors')
          .update({ active: false })
          .eq('id', doctorId);

        if (softErr) throw softErr;

        return jsonOk({
          success: true,
          mode: 'soft',
          message: 'Hard delete failed due to constraints; doctor was successfully deactivated (Soft Delete).',
        });
      }

      // Optional: Demote the profile role to user/patient so they cannot access doctor areas anymore
      await admin
        .from('profiles')
        .update({ role: 'patient' })
        .eq('user_id', userId);

      return jsonOk({
        success: true,
        mode: 'hard',
        message: 'Doctor record permanently deleted and role demoted successfully.',
      });
    } else {
      // Soft Delete: simply deactivate
      logger.info(`[api/admin/doctors/[id]] Performing soft delete for doctorId ${doctorId}`);
      
      const { error: softErr } = await admin
        .from('doctors')
        .update({ active: false })
        .eq('id', doctorId);

      if (softErr) throw softErr;

      return jsonOk({
        success: true,
        mode: 'soft',
        message: 'Doctor successfully deactivated.',
      });
    }
  } catch (err) {
    logger.error(`[api/admin/doctors/[id]] DELETE failed for doctorId ${doctorId}`, err);
    return internalError(err instanceof Error ? err.message : 'failed to deactivate/delete doctor');
  }
};
