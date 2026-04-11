import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { withAuthRole, PHARMACIST_ROLES, isAuthed } from '@/lib/api-auth';
import { jsonOk, internalError } from '@/lib/api-helpers';

/**
 * GET /api/pharmacy/orders
 * Returns dispensation orders for the pharmacist's pharmacy.
 * Query params: ?status=pending,under_review&limit=50
 */
export const GET: APIRoute = async ({ request }) => {
  try {
    const auth = await withAuthRole(request, PHARMACIST_ROLES);
    if (!isAuthed(auth)) return auth;
    const { user, supabase } = auth;

    const VALID_STATUSES = [
      'pending', 'assigned', 'under_review', 'clarification_requested',
      'clarification_provided', 'approved_for_dispensation', 'dispensed',
      'partially_dispensed', 'blocked', 'cancelled', 'expired',
    ] as const;

    const url = new URL(request.url);
    const statusFilter = (url.searchParams.get('status')?.split(',') ?? [])
      .filter((s): s is string => VALID_STATUSES.includes(s as typeof VALID_STATUSES[number]));
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);

    // Resolve pharmacist's pharmacy
    const { data: pharmacist } = await supabase
      .from('pharmacists')
      .select('id, pharmacy_id')
      .eq('user_id', user.id)
      .eq('active', true)
      .single();

    if (!pharmacist) {
      return jsonOk({ orders: [], pharmacist: null });
    }

    let query = supabase
      .from('dispensation_orders')
      .select(`
        id, prescription_id, patient_id, doctor_id, pharmacy_id,
        medication, formulation, dose_mg_per_day, quantity_units, duration_days,
        prescription_type, status, clinical_semaphore, semaphore_reasons,
        extraordinary_dose_flag, requires_clarification,
        dispense_window_start, dispense_window_end,
        created_at, updated_at
      `)
      .eq('pharmacy_id', pharmacist.pharmacy_id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (statusFilter.length > 0) {
      query = query.in('status', statusFilter);
    }

    const { data: orders, error } = await query;

    if (error) {
      logger.error('[pharmacy/orders] Query error', error);
      return internalError();
    }

    return jsonOk({ orders: orders ?? [], pharmacistId: pharmacist.id });
  } catch (err) {
    logger.error('[pharmacy/orders] GET error', err);
    return internalError();
  }
};
