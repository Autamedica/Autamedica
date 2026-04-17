/**
 * GET /api/doctors/accounting/dashboard?year=2026&month=4
 * Monthly accounting dashboard with income, expenses, obligations, summary
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth';
import { jsonOk, badRequest, internalError } from '@/lib/api-helpers';
import { accountingService } from '@/lib/doctors/services/accounting.service';
import { doctorsRepo } from '@/lib/doctors/lib/repos/doctors';

export const GET: APIRoute = async ({ request }) => {
  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES);
    if (!isAuthed(auth)) return auth;
    const { supabase } = auth;

    const doctorId = await doctorsRepo.resolveIdByUserId(auth.user.id, supabase);
    if (!doctorId) return badRequest('doctor_not_found');

    const url = new URL(request.url);
    const year = parseInt(url.searchParams.get('year') ?? String(new Date().getFullYear()), 10);
    const monthParam = url.searchParams.get('month');
    const month = monthParam ? parseInt(monthParam, 10) : new Date().getMonth() + 1;

    if (year < 2020 || year > 2030 || month < 1 || month > 12) {
      return badRequest('invalid_period');
    }

    const dashboard = await accountingService.getMonthlyDashboard(supabase, doctorId, year, month);
    return jsonOk(dashboard);
  } catch (err) {
    logger.error('[accounting/dashboard] GET error', err);
    return internalError();
  }
};
