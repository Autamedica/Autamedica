import type { APIRoute } from 'astro';
import { z } from 'zod';
import { ADMIN_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { badRequest, conflict, forbidden, internalError, jsonOk } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';
import { logger } from '@autamedica/shared';

const scope = ['admin', 'platform_admin'] as const;
const receiptSchema = z.object({
  country_code: z.enum(['BR', 'AR']),
  currency: z.enum(['BRL', 'ARS']),
  amount_minor: z.number().int().min(1).max(100000000),
  channel: z.enum(['whatsapp', 'phone', 'website', 'referral', 'walk_in', 'other']),
  payment_method: z.enum(['pix_external', 'bank_transfer', 'cash', 'card_external', 'other']),
  external_reference: z.string().regex(/^[A-Za-z0-9_-]{6,128}$/).nullable().optional(),
  occurred_at: z.string().datetime({ offset: true }),
}).refine(data => data.country_code === 'BR' ? data.currency === 'BRL' : data.currency === 'ARS', {
  message: 'country_currency_mismatch',
});

async function authorize(request: Request, locals: App.Locals) {
  const auth = await withAuthRole(request, [...scope] as (typeof ADMIN_ROLES), locals);
  if (!isAuthed(auth)) return auth;
  // Do not trust a general organization admin to access platform-wide revenue.
  return auth;
}

/** Reports only. No private customer/diagnosis/clinical record is accepted. */
export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await authorize(request, locals);
  if (!isAuthed(auth)) return auth;
  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const { data, error } = await admin.from('commercial_manual_receipts' as never)
      .select('id,country_code,currency,amount_minor,channel,payment_method,occurred_at,reconciliation_status,created_at')
      .order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    const response = jsonOk({
      records: data ?? [],
      reportOnly: true,
      externalVerificationRequired: true,
    });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) {
    logger.error('[commercial/manual-receipts] read failed', error);
    return internalError('manual_receipts_read_failed');
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await authorize(request, locals);
  if (!isAuthed(auth)) return auth;
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) return forbidden('cross_origin_not_allowed');
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.startsWith('application/json')) return badRequest('json_required');

  let body: unknown;
  try { body = await request.json(); } catch { return badRequest('invalid_json'); }
  const parsed = receiptSchema.safeParse(body);
  if (!parsed.success) return badRequest('invalid_manual_receipt');
  const { occurred_at, ...entry } = parsed.data;
  if (Date.parse(occurred_at) > Date.now() + 5 * 60_000) return badRequest('future_receipt_not_allowed');

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const { data, error } = await admin.from('commercial_manual_receipts' as never)
      .insert({
        ...entry,
        occurred_at,
        external_reference: entry.external_reference || null,
        recorded_by: auth.user.id,
        reconciliation_status: 'reported',
      } as never)
      .select('id,reconciliation_status,country_code,currency,amount_minor')
      .single();
    if (error?.code === '23505') return conflict('duplicate_external_reference');
    if (error) throw error;
    const response = jsonOk({ receipt: data, providerOrBankVerified: false }, 201);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) {
    logger.error('[commercial/manual-receipts] create failed', error);
    return internalError('manual_receipt_create_failed');
  }
};
