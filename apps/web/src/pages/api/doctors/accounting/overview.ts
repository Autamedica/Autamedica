/**
 * GET /api/doctors/accounting/overview?year=2026
 * Annual overview with regime comparison (monotributo vs RI)
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

    const overview = await accountingService.getAnnualOverview(supabase, doctorId, year);
    return jsonOk(overview);
  } catch (err) {
    logger.error('[accounting/overview] GET error', err);
    return internalError();
  }
};
