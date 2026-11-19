import type { APIRoute } from 'astro';
import { ADMIN_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { badRequest, internalError, jsonOk } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';

export const prerender = false;

const countries = {
  BR: { currency: 'BRL' },
  AR: { currency: 'ARS' },
} as const;

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, ADMIN_ROLES, locals);
  if (!isAuthed(auth)) return auth;
  const db = createAstroAdminClient(locals.runtime?.env) as any;
  const { data, error } = await db.from('pharmacy_dispatch_pricing_configs')
    .select('country_code,currency,consultation_price_minor,doctor_fee_minor,partner_commission_minor,require_payment_before_dispatch,updated_by,updated_at,change_reason')
    .order('country_code');
  if (error) return internalError('pharmacy_pricing_unavailable');
  return jsonOk(data ?? []);
};

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, ADMIN_ROLES, locals);
  if (!isAuthed(auth)) return auth;
  const body = await request.json().catch(() => null) as {
    country_code?: string;
    currency?: string;
    consultation_price_minor?: number;
    doctor_fee_minor?: number;
    partner_commission_minor?: number;
    require_payment_before_dispatch?: boolean;
    change_reason?: string;
  } | null;
  const country = body?.country_code as keyof typeof countries | undefined;
  const reason = typeof body?.change_reason === 'string' ? body.change_reason.trim() : '';
  const amountFields = [
    body?.consultation_price_minor,
    body?.doctor_fee_minor,
    body?.partner_commission_minor,
  ];
  if (!country || !(country in countries)
      || body?.currency !== countries[country].currency
      || amountFields.some(value => !Number.isSafeInteger(value))
      || body!.consultation_price_minor! <= 0
      || body!.doctor_fee_minor! <= 0
      || body!.partner_commission_minor! < 0
      || body!.doctor_fee_minor! + body!.partner_commission_minor! > body!.consultation_price_minor!
      || typeof body?.require_payment_before_dispatch !== 'boolean'
      || reason.length < 8 || reason.length > 500) {
    return badRequest('valid_country_tariff_and_audit_reason_required');
  }

  const db = createAstroAdminClient(locals.runtime?.env) as any;
  const { data, error } = await db.rpc('admin_upsert_pharmacy_dispatch_pricing_config', {
    p_country_code: country,
    p_currency: countries[country].currency,
    p_consultation_price_minor: body!.consultation_price_minor,
    p_doctor_fee_minor: body!.doctor_fee_minor,
    p_partner_commission_minor: body!.partner_commission_minor,
    p_require_payment_before_dispatch: body!.require_payment_before_dispatch,
    p_actor_id: auth.user.id,
    p_change_reason: reason,
  });
  if (error) return internalError('pharmacy_pricing_update_failed');
  return jsonOk(data);
};
