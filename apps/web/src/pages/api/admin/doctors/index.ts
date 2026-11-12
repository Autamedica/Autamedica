import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { createAstroAdminClient } from '@/lib/supabase';
import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers';

type AdminDoctorLicenseRecord = {
  id: string;
  doctor_id: string;
  license_number: string;
  license_type: string;
  province: string | null;
  uf_brazil: string | null;
  status: string;
  cfm_validation_status: string | null;
  cfm_last_checked_at: string | null;
  cfm_evidence_path: string | null;
  cfm_review_notes: string | null;
  cfm_reviewed_by: string | null;
  cfm_reviewed_at: string | null;
  cfm_evidence_url?: string | null;
};

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

export const GET: APIRoute = async ({ request, locals }) => {
  const admin = createAstroAdminClient(locals.runtime?.env);
  const auth = await assertAdmin(request, admin, locals);
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
      .order('created_at', { ascending: false });

    if (error) throw error;

    const doctorIds = (doctors || []).map((doc) => doc.id);
    const doctorsWithAvailability = new Set<string>();
    const doctorsWithActiveSubscription = new Set<string>();
    const licensesByDoctor = new Map<string, AdminDoctorLicenseRecord[]>();

    if (doctorIds.length > 0) {
      const [availRes, subRes, licensesRes] = await Promise.all([
        admin
          .from('doctor_availability')
          .select('doctor_id, start_time, end_time')
          .in('doctor_id', doctorIds)
          .eq('is_active', true),
        admin
          .from('doctor_subscriptions')
          .select('doctor_id')
          .in('doctor_id', doctorIds)
          .eq('status', 'active'),
        admin
          .from('doctor_licenses')
          .select('id, doctor_id, license_number, license_type, province, uf_brazil, status, cfm_validation_status, cfm_last_checked_at, cfm_evidence_path, cfm_review_notes, cfm_reviewed_by, cfm_reviewed_at')
          .in('doctor_id', doctorIds),
      ]);

      if (availRes.error) {
        logger.warn('[api/admin/doctors] availability lookup failed', availRes.error);
      } else {
        const availByDoctor = new Map<string, Array<{ start_time: string; end_time: string }>>();
        for (const row of availRes.data ?? []) {
          const list = availByDoctor.get(row.doctor_id) ?? [];
          list.push({ start_time: row.start_time, end_time: row.end_time });
          availByDoctor.set(row.doctor_id, list);
        }

        availByDoctor.forEach((slots, doctorId) => {
          const isFakePreset = slots.length >= 7 && slots.every(
            (s) => s.start_time === '00:00:00' && s.end_time === '23:59:00',
          );
          if (!isFakePreset && slots.length > 0) {
            doctorsWithAvailability.add(doctorId);
          }
        });
      }

      if (subRes.error) {
        logger.warn('[api/admin/doctors] subscription lookup failed', subRes.error);
      } else {
        for (const row of subRes.data ?? []) {
          doctorsWithActiveSubscription.add(row.doctor_id);
        }
      }

      if (licensesRes.error) {
        logger.error('[api/admin/doctors] license lookup failed', licensesRes.error);
      } else {
        const signedLicenses = await Promise.all((licensesRes.data ?? []).map(async (license) => {
          let evidenceUrl: string | null = null;
          if (license.cfm_evidence_path) {
            const { data: signed, error: signedError } = await admin.storage
              .from('doctor-credential-evidence')
              .createSignedUrl(license.cfm_evidence_path, 10 * 60);
            if (signedError) {
              logger.warn('[api/admin/doctors] CFM evidence link could not be signed', { licenseId: license.id });
            } else {
              evidenceUrl = signed.signedUrl;
            }
          }
          return { ...license, cfm_evidence_url: evidenceUrl };
        }));

        for (const license of signedLicenses) {
          const list = licensesByDoctor.get(license.doctor_id) ?? [];
          list.push(license);
          licensesByDoctor.set(license.doctor_id, list);
        }
      }
    }

    const enrichedDoctors = (doctors || []).map((doc) => ({
      ...doc,
      doctor_licenses: licensesByDoctor.get(doc.id) ?? [],
      has_availability: doctorsWithAvailability.has(doc.id),
      has_active_plan: doctorsWithActiveSubscription.has(doc.id),
    }));

    return jsonOk(enrichedDoctors);
  } catch (err) {
    logger.error('[api/admin/doctors] GET failed', err);
    return internalError(err instanceof Error ? err.message : 'failed to fetch doctors');
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const admin = createAstroAdminClient(locals.runtime?.env);
  const auth = await assertAdmin(request, admin, locals);
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
      .eq('id', savedDoctor.id)
      .single();

    if (finalFetchErr) throw finalFetchErr;

    return jsonOk(finalDoctor);
  } catch (err) {
    logger.error('[api/admin/doctors] POST failed', err);
    return internalError(err instanceof Error ? err.message : 'failed to create/update doctor');
  }
};
