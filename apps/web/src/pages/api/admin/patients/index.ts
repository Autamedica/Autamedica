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

export const GET: APIRoute = async ({ request, locals }) => {
  const admin = createAstroAdminClient(locals.runtime?.env);
  const auth = await assertAdmin(request, admin, locals);
  if (!auth.ok) return unauthorized('admin role required');

  try {
    const url = new URL(request.url);
    const search = url.searchParams.get('q') || '';

    let queryBuilder = admin
      .from('profiles')
      .select(`
        user_id,
        first_name,
        last_name,
        email,
        phone,
        avatar_url,
        role,
        sss_validation_status,
        patient:patients(
          id,
          dni,
          cuil,
          address,
          birth_date,
          gender,
          insurance_info,
          active,
          created_at
        )
      `)
      .eq('role', 'patient')
      .order('created_at', { ascending: false });

    if (search) {
      queryBuilder = queryBuilder.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: rawPatients, error } = await queryBuilder;
    if (error) throw error;

    // Format list nicely for frontend consumption
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formatted = (rawPatients || []).map((p: any) => {
      const patientDetails = Array.isArray(p.patient) ? p.patient[0] : p.patient;
      return {
        id: patientDetails?.id || '',
        userId: p.user_id,
        firstName: p.first_name || '',
        lastName: p.last_name || '',
        email: p.email || '',
        phone: p.phone || '',
        avatarUrl: p.avatar_url || '',
        sssValidationStatus: p.sss_validation_status || null,
        dni: patientDetails?.dni || '',
        cuil: patientDetails?.cuil || '',
        address: patientDetails?.address || '',
        birthDate: patientDetails?.birth_date || '',
        gender: patientDetails?.gender || '',
        insuranceInfo: patientDetails?.insurance_info || null,
        active: patientDetails?.active ?? true,
        createdAt: patientDetails?.created_at || p.created_at,
      };
    });

    return jsonOk(formatted);
  } catch (err) {
    logger.error('[api/admin/patients] GET failed', err);
    return internalError('failed to load patients');
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
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
      sssValidationStatus,
    } = body;

    if (!firstName || !lastName || !email) {
      return badRequest('firstName, lastName and email are required');
    }

    // 1. Create the Auth User in Supabase
    const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        role: 'patient',
      },
    });

    if (authErr) {
      logger.error('[api/admin/patients] Auth creation failed', authErr);
      return badRequest(authErr.message);
    }

    const userId = authUser.user.id;

    // 2. Create the profile row
    const { error: profileErr } = await admin
      .from('profiles')
      .update({
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone || null,
        role: 'patient',
        sss_validation_status: sssValidationStatus || 'pending',
      })
      .eq('user_id', userId);

    if (profileErr) throw profileErr;

    // 3. Create the patient row
    const { data: newPatient, error: patientErr } = await admin
      .from('patients')
      .insert({
        user_id: userId,
        dni: dni || null,
        cuil: cuil || null,
        gender: gender || null,
        birth_date: birthDate || null,
        address: address || null,
        insurance_info: insuranceInfo || null,
        active: true,
      })
      .select('*')
      .single();

    if (patientErr) throw patientErr;

    return jsonOk({
      id: newPatient.id,
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
      active: true,
      sssValidationStatus: sssValidationStatus || 'pending',
    });
  } catch (err) {
    logger.error('[api/admin/patients] POST failed', err);
    return internalError(err instanceof Error ? err.message : 'failed to create patient');
  }
};
