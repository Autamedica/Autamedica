/**
 * GET/POST /api/doctors/accounting/income
 * Income records CRUD
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth';
import { jsonOk, badRequest, internalError } from '@/lib/api-helpers';
import { accountingRepo } from '@/lib/doctors/lib/repos/accounting.repo';
import { accountingService } from '@/lib/doctors/services/accounting.service';

export const GET: APIRoute = async ({ request }) => {
  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES);
    if (!isAuthed(auth)) return auth;
    const { supabase } = auth;

    const { data: doctor } = await supabase.from('doctors').select('id').eq('user_id', auth.user.id).single();
    if (!doctor) return badRequest('doctor_not_found');

    const url = new URL(request.url);
    const year = parseInt(url.searchParams.get('year') ?? String(new Date().getFullYear()), 10);
    const monthParam = url.searchParams.get('month');
    const month = monthParam ? parseInt(monthParam, 10) : undefined;

    const income = await accountingRepo.listIncome(supabase, doctor.id, year, month);
    return jsonOk({ income });
  } catch (err) {
    logger.error('[accounting/income] GET error', err);
    return internalError();
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES);
    if (!isAuthed(auth)) return auth;
    const { supabase } = auth;

    const { data: doctor } = await supabase.from('doctors').select('id').eq('user_id', auth.user.id).single();
    if (!doctor) return badRequest('doctor_not_found');

    const profile = await accountingService.getFiscalProfile(supabase, doctor.id);
    if (!profile) return badRequest('fiscal_profile_required');

    const body = await request.json();
    if (!body.grossAmount || !body.source || !body.periodYear || !body.periodMonth) {
      return badRequest('missing_required_fields');
    }

    const record = await accountingRepo.insertIncome(supabase, {
      ...body,
      doctorId: doctor.id,
      fiscalProfileId: profile.id,
      netAmount: body.netAmount ?? (body.grossAmount - (body.taxWithheld ?? 0)),
    });

    // Recalculate summary
    await accountingService.recalculateSummary(supabase, doctor.id, body.periodYear, body.periodMonth);

    return jsonOk({ record }, 201);
  } catch (err) {
    logger.error('[accounting/income] POST error', err);
    return internalError();
  }
};
