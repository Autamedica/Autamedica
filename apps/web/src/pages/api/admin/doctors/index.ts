import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { createAstroAdminClient } from '@/lib/supabase';
import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers';

async function assertAdmin(
  request: Request,
  admin: ReturnType<typeof createAstroAdminClient>,
): Promise<{ ok: boolean; userId?: string }> {
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

export const GET: APIRoute = async ({ request, locals }) => {
  const admin = createAstroAdminClient(locals.runtime?.env);
  const auth = await assertAdmin(request, admin);
  if (!auth.ok) return unauthorized('admin role required');

  try {
    // Fetch all doctors with their associated profiles (both active and inactive)
    const { data: doctors, error } = await admin
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
      .order('created_at', { ascending: false });

    if (error) throw error;

    return jsonOk(doctors || []);
  } catch (err) {
    logger.error('[api/admin/doctors] GET failed', err);
    return internalError(err instanceof Error ? err.message : 'failed to fetch doctors');
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const admin = createAstroAdminClient(locals.runtime?.env);
  const auth = await assertAdmin(request, admin);
  if (!auth.ok) return unauthorized('admin role required');

  interface CreateDoctorBody {
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    specialty?: string;
    subspecialty?: string;
    licenseNumber?: string;
    yearsExperience?: string;
    consultationFee?: string;
    enrollmentEntity?: string;
    enrollmentJurisdiction?: string;
    professionalAddress?: string;
    payoutCbu?: string;
    payoutAlias?: string;
    bio?: string;
    languages?: string[] | string;
    sssValidationStatus?: 'valid' | 'pending_review' | 'rejected' | 'exempt' | null;
    matriculaNacional?: string;
    especialidadRegistrada?: string;
    active?: boolean | string;
  }

  let body: CreateDoctorBody;
  try {
    body = await request.json() as CreateDoctorBody;
  } catch {
    return badRequest('invalid JSON');
  }

  const {
    email,
    firstName,
    lastName,
    phone,
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
    active = true,
  } = body;

  if (!email || typeof email !== 'string' || !email.trim()) {
    return badRequest('email is required');
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    // 1. Check if user already exists in profiles
    const { data: existingProfile, error: profileFetchErr } = await admin
      .from('profiles')
      .select('user_id, role')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (profileFetchErr) throw profileFetchErr;

    let targetUserId: string;

    if (existingProfile) {
      targetUserId = existingProfile.user_id;
      logger.info('[api/admin/doctors] Using existing user profile', { targetUserId, cleanEmail });
    } else {
      // 2. Create new user in Supabase Auth via Admin API
      const tempPassword = 'DoctorTempPass' + Math.random().toString(36).slice(-8) + '1!';
      const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email: cleanEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          first_name: firstName || '',
          last_name: lastName || '',
        },
      });

      if (authError) {
        logger.error('[api/admin/doctors] Auth user creation failed', authError);
        return badRequest(`Auth user creation failed: ${authError.message}`);
      }

      if (!authData?.user) {
        throw new Error('No user data returned from Auth creation');
      }

      targetUserId = authData.user.id;
      logger.info('[api/admin/doctors] Created new auth user', { targetUserId, cleanEmail });

      // Give trigger a brief moment to run and insert the profile row if necessary
      // Supabase is usually instant but let's make sure the profile exists or upsert it
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // 3. Update or Upsert the Profile
    const profileUpdate: Record<string, string | null | undefined> = {
      first_name: firstName || '',
      last_name: lastName || '',
      role: 'doctor', // Force role to doctor
    };

    if (phone) profileUpdate.phone = phone;
    if (sssValidationStatus) profileUpdate.sss_validation_status = sssValidationStatus;
    if (matriculaNacional) profileUpdate.matricula_nacional = matriculaNacional;
    if (especialidadRegistrada) profileUpdate.especialidad_registrada = especialidadRegistrada;

    const { error: profileUpdateErr } = await admin
      .from('profiles')
      .upsert({
        user_id: targetUserId,
        email: cleanEmail,
        ...profileUpdate,
      }, { onConflict: 'user_id' });

    if (profileUpdateErr) {
      logger.error('[api/admin/doctors] Profile upsert failed', profileUpdateErr);
      throw profileUpdateErr;
    }

    // 4. Check if doctor record already exists
    const { data: existingDoctor, error: doctorFetchErr } = await admin
      .from('doctors')
      .select('id')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (doctorFetchErr) throw doctorFetchErr;

    const doctorInsert = {
      user_id: targetUserId,
      specialty: specialty || '',
      subspecialty: subspecialty || '',
      license_number: licenseNumber || '',
      years_experience: yearsExperience ? parseInt(yearsExperience, 10) : 0,
      consultation_fee: consultationFee ? parseFloat(consultationFee) : 0,
      enrollment_entity: enrollmentEntity || '',
      enrollment_jurisdiction: enrollmentJurisdiction || '',
      professional_address: professionalAddress || '',
      payout_cbu: payoutCbu || '',
      payout_alias: payoutAlias || '',
      bio: bio || '',
      languages: Array.isArray(languages) ? languages : (languages ? [languages] : []),
      active: active === true || active === 'true',
    };

    let savedDoctor: { id: string };

    if (existingDoctor) {
      // Update existing doctor record
      const { data: updatedDoctor, error: doctorUpdateErr } = await admin
        .from('doctors')
        .update(doctorInsert)
        .eq('id', existingDoctor.id)
        .select()
        .single();

      if (doctorUpdateErr) throw doctorUpdateErr;
      savedDoctor = updatedDoctor;
    } else {
      // Insert new doctor record
      const { data: insertedDoctor, error: doctorInsertErr } = await admin
        .from('doctors')
        .insert(doctorInsert)
        .select()
        .single();

      if (doctorInsertErr) throw doctorInsertErr;
      savedDoctor = insertedDoctor;
    }

    logger.info('[api/admin/doctors] Doctor created/updated successfully', {
      doctorId: savedDoctor.id,
      userId: targetUserId,
      cleanEmail,
    });

    // 5. Fetch fully joined doctor with profile to return
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
      .eq('id', savedDoctor.id)
      .single();

    if (finalFetchErr) throw finalFetchErr;

    return jsonOk(finalDoctor);
  } catch (err) {
    logger.error('[api/admin/doctors] POST failed', err);
    return internalError(err instanceof Error ? err.message : 'failed to create/update doctor');
  }
};
