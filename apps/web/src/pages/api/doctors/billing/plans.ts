/**
 * GET /api/doctors/billing/plans
 * List active subscription plans. Public endpoint (pricing page).
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { jsonOk, internalError } from '@/lib/api-helpers';
import { billingService } from '@/lib/doctors/services/billing.service';
import { createAstroAdminClient } from '@/lib/supabase';

export const GET: APIRoute = async () => {
  try {
    const supabase = createAstroAdminClient();
    const plans = await billingService.getPlans(supabase);
    return jsonOk(plans);
  } catch (err) {
    logger.error('[billing/plans] GET error', err);
    return internalError();
  }
};
