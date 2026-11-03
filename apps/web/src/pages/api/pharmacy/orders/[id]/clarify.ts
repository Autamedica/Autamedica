import { pharmacyErrorCode } from '@/lib/pharmacy/errors';
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { withAuthRole, PHARMACIST_ROLES, isAuthed } from '@/lib/api-auth';
import { badRequest, conflict, forbidden, internalError, jsonOk, notFound } from '@/lib/api-helpers';
import { createAstroAdminClient } from '@/lib/supabase';

const VALID_CATEGORIES = [
  'dose_verification',
  'formulation_mismatch',
  'duration_concern',
  'interaction_alert',
  'bridge_protocol',
  'identity_concern',
  'other',
] as const;

type ClarificationCategory = typeof VALID_CATEGORIES[number];

type UntypedNotificationClient = {
  from: (relation: string) => {
    insert: (payload: Record<string, unknown>) => Promise<{ error: unknown }>
  }
};

function getRuntimeEnv(locals: unknown): Record<string, unknown> | null {
  const runtime = (locals as { runtime?: { env?: Record<string, unknown> } } | undefined)?.runtime;
  return runtime?.env ?? null;
}

function isClarificationCategory(value: string): value is ClarificationCategory {
  return (VALID_CATEGORIES as readonly string[]).includes(value);
}

async function insertNotification(
  admin: ReturnType<typeof createAstroAdminClient>,
  payload: Record<string, unknown>,
): Promise<unknown> {
  return (admin as unknown as UntypedNotificationClient)
    .from('notifications')
    .insert(payload)
    .then(({ error }) => error);
}

export const POST: APIRoute = async ({ request, params, locals }) => {
  const orderId = params.id;
  if (!orderId) return badRequest('missing_order_id');

  try {
    const auth = await withAuthRole(request, PHARMACIST_ROLES, locals);
    if (!isAuthed(auth)) return auth;
    const { user } = auth;

    const body = await request.json().catch(() => null) as {
      question?: unknown;
      question_category?: unknown;
    } | null;

    const question = typeof body?.question === 'string' ? body.question.trim() : '';
    const questionCategory = typeof body?.question_category === 'string'
      ? body.question_category.trim()
      : '';

    if (!question || !questionCategory) {
      return badRequest('question_and_question_category_required');
    }

    if (!isClarificationCategory(questionCategory)) {
      return badRequest('invalid_question_category');
    }

    const admin = createAstroAdminClient(getRuntimeEnv(locals));

    const { data: pharmacist, error: pharmacistError } = await admin
      .from('pharmacists')
      .select('id, pharmacy_id, care_country, role, license_number')
      .eq('user_id', user.id)
      .eq('active', true)
      .maybeSingle();

    if (pharmacistError) {
      logger.error('[pharmacy/orders/clarify] Pharmacist lookup failed', { code: pharmacyErrorCode(pharmacistError) });
      return internalError();
    }

    if (!pharmacist?.id || !pharmacist.pharmacy_id ||
        !['AR','BR'].includes(pharmacist.care_country ?? '') ||
        !['pharmacist','pharmacy_director'].includes(pharmacist.role ?? '') ||
        !pharmacist.license_number?.trim()) {
      return forbidden('not_pharmacist');
    }

    const { data: order, error: orderError } = await admin
      .from('dispensation_orders')
      .select('id, doctor_id, patient_id, prescription_id, pharmacy_id, care_country, status')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError) {
      logger.error('[pharmacy/orders/clarify] Order lookup failed', { code: pharmacyErrorCode(orderError) });
      return internalError();
    }

    if (!order) {
      return notFound('order_not_found');
    }

    // Administrative DB clients bypass RLS: enforce assignment and jurisdiction here.
    if (!order.pharmacy_id || order.pharmacy_id !== pharmacist.pharmacy_id ||
        order.care_country !== pharmacist.care_country) {
      return forbidden('order_not_in_pharmacy');
    }

    const [pharmacyResult, prescriptionResult, doctorResult, patientResult] = await Promise.all([
      admin.from('pharmacies').select('active, deleted_at, care_country')
        .eq('id', pharmacist.pharmacy_id).maybeSingle(),
      admin.from('prescriptions').select('country_code, doctor_id, patient_id')
        .eq('id', order.prescription_id).maybeSingle(),
      admin.from('doctors').select('care_country, active')
        .eq('id', order.doctor_id).maybeSingle(),
      admin.from('patients').select('care_country, active')
        .eq('id', order.patient_id).maybeSingle(),
    ]);
    const pharmacy = pharmacyResult.data;
    const rx = prescriptionResult.data;
    const prescriber = doctorResult.data;
    const patient = patientResult.data;
    if (pharmacyResult.error || prescriptionResult.error || doctorResult.error || patientResult.error ||
        !pharmacy?.active || pharmacy.deleted_at || pharmacy.care_country !== order.care_country ||
        rx?.country_code !== order.care_country ||
        rx.doctor_id !== order.doctor_id || rx.patient_id !== order.patient_id ||
        !prescriber?.active || prescriber.care_country !== order.care_country ||
        !patient?.active || patient.care_country !== order.care_country) {
      return forbidden('prescription_or_pharmacy_country_mismatch');
    }

    if (!['under_review', 'blocked'].includes(order.status)) {
      return conflict('order_not_eligible_for_clarification');
    }

    const { data: existingClarification, error: existingError } = await admin
      .from('dispensation_clarifications')
      .select('id')
      .eq('order_id', orderId)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingError) {
      logger.error('[pharmacy/orders/clarify] Pending clarification lookup failed', { code: pharmacyErrorCode(existingError) });
      return internalError();
    }

    if (existingClarification?.id) {
      return conflict('clarification_already_pending');
    }

    const requestedAt = new Date();
    const expiresAt = new Date(requestedAt.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const { data: clarification, error: clarificationError } = await auth.supabase
      .from('dispensation_clarifications')
      .insert({
        order_id: orderId,
        requested_by: user.id,
        question,
        question_category: questionCategory,
        status: 'pending',
        requested_at: requestedAt.toISOString(),
        expires_at: expiresAt,
      })
      .select('id')
      .single();

    if (clarificationError) {
      if (pharmacyErrorCode(clarificationError) === '23505') return conflict('clarification_already_pending');
      if (pharmacyErrorCode(clarificationError) === '42501') return forbidden('pharmacy_authorization_required');
      if (pharmacyErrorCode(clarificationError) === '23514') return conflict('clarification_state_conflict');
      logger.error('[pharmacy/orders/clarify] Clarification insert failed', { code: pharmacyErrorCode(clarificationError) });
      return internalError();
    }

    // PostgreSQL committed the clarification, order transition and audit together.
    const { data: doctor, error: doctorError } = await admin
      .from('doctors')
      .select('user_id')
      .eq('id', order.doctor_id)
      .maybeSingle();

    if (doctorError) {
      logger.warn('[pharmacy/orders/clarify] Doctor notification lookup failed', { code: pharmacyErrorCode(doctorError) });
    }

    if (doctor?.user_id) {
      const notificationError = await insertNotification(admin, {
          user_id: doctor.user_id,
          type: 'clarification_requested',
          title: 'Se requiere aclaración sobre receta',
          body: question,
          data: {
            orderId,
            clarificationId: clarification.id,
            question,
            category: questionCategory,
          },
          read: false,
          created_at: new Date().toISOString(),
        });

      if (notificationError) {
        logger.warn('[pharmacy/orders/clarify] Notification insert failed', { code: pharmacyErrorCode(notificationError) });
      }
    }

    return jsonOk({
      clarificationId: clarification.id,
      orderStatus: 'clarification_requested',
      expiresAt,
    }, 201);
  } catch (err) {
    logger.error('[pharmacy/orders/clarify] POST error', { code: pharmacyErrorCode(err) });
    return internalError();
  }
};

