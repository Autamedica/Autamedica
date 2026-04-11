import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { withAuthRole, PHARMACIST_ROLES, isAuthed } from '@/lib/api-auth';
import { jsonOk, badRequest, forbidden, internalError } from '@/lib/api-helpers';
import { dispensationService } from '@/lib/pharmacy/services/dispensation.service';
import type { DispenseInput } from '@/lib/pharmacy/services/dispensation.service';

export const POST: APIRoute = async ({ request, params }) => {
  const orderId = params.id;
  if (!orderId) return badRequest('missing_order_id');

  try {
    const auth = await withAuthRole(request, PHARMACIST_ROLES);
    if (!isAuthed(auth)) return auth;
    const { user, supabase } = auth;

    const body = await request.json() as DispenseInput;
    const result = await dispensationService.dispense(supabase, user.id, orderId, body);

    if (result.ok === false) {
      const code = result.error.code;
      if (code === 'not_pharmacist' || code === 'order_not_in_pharmacy') return forbidden(code);
      return badRequest(code);
    }

    return jsonOk(result.data);
  } catch (err) {
    logger.error('[pharmacy/dispense] POST error', err);
    return internalError();
  }
};
