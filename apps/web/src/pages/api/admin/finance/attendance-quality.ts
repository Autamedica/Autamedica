import type { APIRoute } from 'astro';
import { withAuthRole, isAuthed } from '@/lib/api-auth';
import { createAstroAdminClient } from '@/lib/supabase';
import { internalError, jsonOk } from '@/lib/api-helpers';
import { logger } from '@autamedica/shared';

/** Aggregate counters for attendance review. Never returns patient identifiers. */
export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, ['platform_admin','admin'], locals);
  if (!isAuthed(auth)) return auth;
  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const { data, error } = await admin.rpc('get_overdue_appointments_review_summary' as never);
    if (error) throw error;
    const payload: unknown = data;
    const row = (Array.isArray(payload) ? payload[0] : payload) as Record<string, unknown> | null | undefined;
    const response = jsonOk({
      overdueUnverified: Number(row?.overdue_total ?? 0),
      overdueWithApprovedPayment: Number(row?.overdue_with_approved_payment ?? 0),
      historicNoShowWithApprovedPayment: Number(row?.historic_no_show_with_approved_payment ?? 0),
      source: 'aggregate_database',
      warning: 'No-show labels and payment statuses require evidence-based review, not automatic correction.',
    });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) {
    logger.error('[admin/finance/attendance-quality] failure', error);
    return internalError('attendance_quality_unavailable');
  }
};
