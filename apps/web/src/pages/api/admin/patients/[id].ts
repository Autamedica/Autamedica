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
  const patientId = params.id;
  if (!patientId) return badRequest('Patient ID is required');

  const admin = createAstroAdminClient(locals.runtime?.env);
  const auth = await assertAdmin(request, admin, locals);
  if (!auth.ok) return unauthorized('admin role required');

  try {
    const body = await request.json();
    const {
      firstName,
      lastName,
      email,
      phone,
      dni,
      cuil,
      gender,
      birthDate,
      address,
      insuranceInfo,
      active,
      sssValidationStatus,
    } = body;

    // 1. Fetch patient to get user_id
    const { data: patient, error: findErr } = await admin
      .from('patients')
      .select('user_id')
      .eq('id', patientId)
      .maybeSingle();

    if (findErr || !patient) {
      return badRequest('patient not found');
    }

    const userId = patient.user_id;

    // 2. Update profile
    const { error: profileErr } = await admin
      .from('profiles')
      .update({
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone || null,
        sss_validation_status: sssValidationStatus || 'pending',
      })
      .eq('user_id', userId);

    if (profileErr) throw profileErr;

    // 3. Update patient
    const { data: updatedPatient, error: patientErr } = await admin
      .from('patients')
      .update({
        dni: dni || null,
        cuil: cuil || null,
        gender: gender || null,
        birth_date: birthDate || null,
        address: address || null,
        insurance_info: insuranceInfo || null,
        active: active ?? true,
      })
      .eq('id', patientId)
      .select('*')
      .single();

    if (patientErr) throw patientErr;

    // 4. Update auth user email if changed
    if (email) {
      await admin.auth.admin.updateUserById(userId, { email });
    }

    return jsonOk({
      id: updatedPatient.id,
      userId,
      firstName,
      lastName,
      email,
      phone,
      dni,
      cuil,
      gender,
      birthDate,
      address,
      insuranceInfo,
      active: updatedPatient.active,
      sssValidationStatus,
    });
  } catch (err) {
    logger.error(`[api/admin/patients/${patientId}] PUT failed`, err);
    return internalError('failed to update patient');
  }
};

export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const patientId = params.id;
  if (!patientId) return badRequest('Patient ID is required');

  const admin = createAstroAdminClient(locals.runtime?.env);
  const auth = await assertAdmin(request, admin, locals);
  if (!auth.ok) return unauthorized('admin role required');

  try {
    // 1. Fetch patient to get user_id
    const { data: patient, error: findErr } = await admin
      .from('patients')
      .select('user_id')
      .eq('id', patientId)
      .maybeSingle();

    if (findErr || !patient) {
      return badRequest('patient not found');
    }

    const userId = patient.user_id;

    // 2. Delete patient row
    const { error: patientErr } = await admin
      .from('patients')
      .delete()
      .eq('id', patientId);

    if (patientErr) throw patientErr;

    // 3. Delete profile row
    const { error: profileErr } = await admin
      .from('profiles')
      .delete()
      .eq('user_id', userId);

    if (profileErr) throw profileErr;

    // 4. Delete Auth User from Supabase
    const { error: authErr } = await admin.auth.admin.deleteUser(userId);
    if (authErr) {
      logger.warn(`[api/admin/patients/${patientId}] Failed to delete auth user, keeping profile deleted`, authErr);
    }

    return jsonOk({ success: true });
  } catch (err) {
    logger.error(`[api/admin/patients/${patientId}] DELETE failed`, err);
    return internalError('failed to delete patient');
  }
};
