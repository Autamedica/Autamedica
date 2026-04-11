import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { withAuthRole, PHARMACIST_ROLES, isAuthed } from '@/lib/api-auth';
import { jsonOk, internalError } from '@/lib/api-helpers';
import { dispensationService } from '@/lib/pharmacy/services/dispensation.service';

export const GET: APIRoute = async ({ request }) => {
  try {
    const auth = await withAuthRole(request, PHARMACIST_ROLES);
    if (!isAuthed(auth)) return auth;
    const { user, supabase } = auth;

    const url = new URL(request.url);
    const rawStatuses = url.searchParams.get('status')?.split(',') ?? [];
    const statusFilter = dispensationService.filterStatuses(rawStatuses);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);

    const result = await dispensationService.listOrders(supabase, user.id, statusFilter, limit);
    return jsonOk(result.ok ? result.data : { orders: [], pharmacistId: null });
  } catch (err) {
    logger.error('[pharmacy/orders] GET error', err);
    return internalError();
  }
};
