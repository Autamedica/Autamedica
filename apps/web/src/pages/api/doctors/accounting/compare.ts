/**
 * GET /api/doctors/accounting/compare?annualIncome=50000000&annualExpenses=10000000
 * Compare Monotributo vs Responsable Inscripto for given income level
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth';
import { jsonOk, badRequest, internalError } from '@/lib/api-helpers';
import { compareRegimes } from '@/lib/doctors/services/accounting.service';

export const GET: APIRoute = async ({ request }) => {
  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES);
    if (!isAuthed(auth)) return auth;

    const url = new URL(request.url);
    const annualIncome = parseInt(url.searchParams.get('annualIncome') ?? '0', 10);
    const annualExpenses = parseInt(url.searchParams.get('annualExpenses') ?? '0', 10);
    const annualIvaCredito = parseInt(url.searchParams.get('annualIvaCredito') ?? '0', 10);

    if (annualIncome <= 0) return badRequest('annualIncome_required');

    const comparison = compareRegimes(annualIncome, annualExpenses, annualIvaCredito);
    return jsonOk(comparison);
  } catch (err) {
    logger.error('[accounting/compare] GET error', err);
    return internalError();
  }
};
