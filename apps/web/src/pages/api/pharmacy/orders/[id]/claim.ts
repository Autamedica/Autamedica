import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { withAuthRole, PHARMACIST_ROLES, isAuthed } from '@/lib/api-auth';
import { jsonOk, internalError } from '@/lib/api-helpers';
import { dispensationService } from '@/lib/pharmacy/services/dispensation.service';
import { createAstroAdminClient } from '@/lib/supabase';

export const POST: APIRoute = async ({ request, params, locals }) => {
  try {
    const auth = await withAuthRole(request, PHARMACIST_ROLES);
    if (!isAuthed(auth)) return auth;
    const { user } = auth;
    const admin = createAstroAdminClient(locals.runtime?.env);

    const orderId = params.id;
    if (!orderId) {
      return new Response(JSON.stringify({ error: 'order_id required' }), { status: 400 });
    }

    const result = await dispensationService.claimOrder(admin, user.id, orderId);
    if (result.ok) {
      return jsonOk(result.data);
    }

    // Narrow error — result.ok is false here
    const errorResult = result as { ok: false; error: { code: string } };
    const code = errorResult.error.code;
    const httpStatus = code === 'not_pharmacist' ? 403 : code === 'order_not_in_pharmacy' ? 409 : 400;
    return new Response(JSON.stringify({ error: errorResult.error }), { status: httpStatus });
  } catch (err) {
    logger.error('[pharmacy/orders/claim] POST error', err);
    return internalError();
  }
};
