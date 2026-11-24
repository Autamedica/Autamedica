/**
 * GET/POST /api/doctors/accounting/expenses
 * Expense records CRUD
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth';
import { jsonOk, badRequest, internalError } from '@/lib/api-helpers';
import { accountingRepo } from '@/lib/doctors/lib/repos/accounting.repo';
import { accountingService } from '@/lib/doctors/services/accounting.service';
import { doctorsRepo } from '@/lib/doctors/lib/repos/doctors';

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
    if (!isAuthed(auth)) return auth;
    const { supabase } = auth;

    const doctorId = await doctorsRepo.resolveIdByUserId(auth.user.id, supabase);
    if (!doctorId) return badRequest('doctor_not_found');

    const url = new URL(request.url);
    const year = parseInt(url.searchParams.get('year') ?? String(new Date().getFullYear()), 10);
    const monthParam = url.searchParams.get('month');
    const month = monthParam ? parseInt(monthParam, 10) : undefined;

    if (!Number.isInteger(year) || year < 2020 || year > 2030 || (month !== undefined && (!Number.isInteger(month) || month < 1 || month > 12))) {
      return badRequest('invalid_period');
    }

    const expenses = await accountingRepo.listExpenses(supabase, doctorId, year, month);
    return jsonOk({ expenses });
  } catch (err) {
    logger.error('[accounting/expenses] GET error', err);
    return internalError();
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
    if (!isAuthed(auth)) return auth;
    const { supabase } = auth;

    const doctorId = await doctorsRepo.resolveIdByUserId(auth.user.id, supabase);
    if (!doctorId) return badRequest('doctor_not_found');

    const profile = await accountingService.getFiscalProfile(supabase, doctorId);
    if (!profile) return badRequest('fiscal_profile_required');

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return badRequest('invalid_body');
    }
    if (!body.amount || !body.category || !body.description || !body.periodYear || !body.periodMonth) {
      return badRequest('missing_required_fields');
    }

    const record = await accountingRepo.insertExpense(supabase, {
      ...body,
      doctorId,
      fiscalProfileId: profile.id,
      deductible: profile.taxRegime === 'responsable_inscripto' ? (body.deductible ?? true) : false,
    });

    await accountingService.recalculateSummary(supabase, doctorId, body.periodYear, body.periodMonth);

    return jsonOk({ record }, 201);
  } catch (err) {
    logger.error('[accounting/expenses] POST error', err);
    return internalError();
  }
};
