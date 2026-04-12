/**
 * GET/PUT /api/doctors/accounting/profile
 * Doctor fiscal profile (tax regime, CUIT, category)
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth';
import { jsonOk, badRequest, internalError } from '@/lib/api-helpers';
import { accountingService } from '@/lib/doctors/services/accounting.service';

export const GET: APIRoute = async ({ request }) => {
  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES);
    if (!isAuthed(auth)) return auth;
    const { supabase } = auth;

    const { data: doctor } = await supabase.from('doctors').select('id').eq('user_id', auth.user.id).single();
    if (!doctor) return badRequest('doctor_not_found');

    const profile = await accountingService.getFiscalProfile(supabase, doctor.id);
    return jsonOk({ profile });
  } catch (err) {
    logger.error('[accounting/profile] GET error', err);
    return internalError();
  }
};

export const PUT: APIRoute = async ({ request }) => {
  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES);
    if (!isAuthed(auth)) return auth;
    const { supabase } = auth;

    const { data: doctor } = await supabase.from('doctors').select('id').eq('user_id', auth.user.id).single();
    if (!doctor) return badRequest('doctor_not_found');

    const body = await request.json();
    const profile = await accountingService.saveFiscalProfile(supabase, doctor.id, body);
    return jsonOk({ profile });
  } catch (err) {
    logger.error('[accounting/profile] PUT error', err);
    return internalError();
  }
};
