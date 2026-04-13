/**
 * GET /api/doctors/billing/subscription — current doctor subscription
 * POST /api/doctors/billing/subscription — create a new subscription
 * DELETE /api/doctors/billing/subscription — cancel subscription
 *
 * Reads use the user's Supabase client (RLS scoped to doctor).
 * Writes use the admin client (service_role) because RLS only grants
 * INSERT/UPDATE to service_role on billing tables.
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth';
import { jsonOk, badRequest, internalError } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';
import { billingService } from '@/lib/doctors/services/billing.service';
import type { PlanSlug } from '@autamedica/types';

const VALID_SLUGS: PlanSlug[] = ['basico', 'pro', 'premium'];

export const GET: APIRoute = async ({ request }) => {
  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES);
    if (!isAuthed(auth)) return auth;

    const { data: doctor } = await auth.supabase.from('doctors').select('id').eq('user_id', auth.user.id).single();
    if (!doctor) return badRequest('doctor_not_found');

    const admin = createAstroAdminClient();
    const subscription = await billingService.getDoctorSubscription(admin, doctor.id);
    return jsonOk(subscription);
  } catch (err) {
    logger.error('[billing/subscription] GET error', err);
    return internalError();
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES);
    if (!isAuthed(auth)) return auth;

    const { data: doctor } = await auth.supabase.from('doctors').select('id').eq('user_id', auth.user.id).single();
    if (!doctor) return badRequest('doctor_not_found');

    const body = await request.json() as { planSlug?: string };
    if (!body.planSlug || !VALID_SLUGS.includes(body.planSlug as PlanSlug)) {
      return badRequest('invalid_plan_slug');
    }

    const doctorEmail = auth.user.email ?? '';
    if (!doctorEmail) return badRequest('doctor_email_required');

    const admin = createAstroAdminClient();
    const result = await billingService.createSubscription(
      admin,
      doctor.id,
      body.planSlug as PlanSlug,
      doctorEmail,
    );

    return jsonOk(result);
  } catch (err) {
    logger.error('[billing/subscription] POST error', err);
    return internalError();
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  try {
    const auth = await withAuthRole(request, DOCTOR_ROLES);
    if (!isAuthed(auth)) return auth;

    const { data: doctor } = await auth.supabase.from('doctors').select('id').eq('user_id', auth.user.id).single();
    if (!doctor) return badRequest('doctor_not_found');

    const admin = createAstroAdminClient();
    await billingService.cancelSubscription(admin, doctor.id);
    return jsonOk({ cancelled: true });
  } catch (err) {
    logger.error('[billing/subscription] DELETE error', err);
    return internalError();
  }
};
