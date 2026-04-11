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

function getClientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')
    ?? request.headers.get('cf-connecting-ip')
    ?? 'unknown';
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
      .select('id, pharmacy_id')
      .eq('user_id', user.id)
      .eq('active', true)
      .maybeSingle();

    if (pharmacistError) {
      logger.error('[pharmacy/orders/clarify] Pharmacist lookup failed', pharmacistError);
      return internalError();
    }

    if (!pharmacist?.id || !pharmacist.pharmacy_id) {
      return forbidden('not_pharmacist');
    }

    const { data: order, error: orderError } = await admin
      .from('dispensation_orders')
      .select('id, doctor_id, pharmacy_id, status')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError) {
      logger.error('[pharmacy/orders/clarify] Order lookup failed', orderError);
      return internalError();
    }

    if (!order) {
      return notFound('order_not_found');
    }

    if (order.pharmacy_id && order.pharmacy_id !== pharmacist.pharmacy_id) {
      return forbidden('order_not_in_pharmacy');
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
      logger.error('[pharmacy/orders/clarify] Pending clarification lookup failed', existingError);
      return internalError();
    }

    if (existingClarification?.id) {
      return conflict('clarification_already_pending');
    }

    const requestedAt = new Date();
    const expiresAt = new Date(requestedAt.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const { data: clarification, error: clarificationError } = await admin
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
      logger.error('[pharmacy/orders/clarify] Clarification insert failed', clarificationError);
      return internalError();
    }

    const { error: updateOrderError } = await admin
      .from('dispensation_orders')
      .update({ status: 'clarification_requested' })
      .eq('id', orderId);

    if (updateOrderError) {
      logger.error('[pharmacy/orders/clarify] Order update failed', updateOrderError);
      return internalError();
    }

    await admin
      .from('pharmacy_audit_events')
      .insert({
        order_id: orderId,
        event_type: 'clarification_requested',
        actor_id: user.id,
        actor_role: 'pharmacist',
        details: {
          question,
          category: questionCategory,
          clarification_id: clarification.id,
          expires_at: expiresAt,
        },
        ip_address: getClientIp(request),
      })
      .then(({ error }) => {
        if (error) {
          logger.warn('[pharmacy/orders/clarify] Audit insert failed', error);
        }
      });

    const { data: doctor, error: doctorError } = await admin
      .from('doctors')
      .select('user_id')
      .eq('id', order.doctor_id)
      .maybeSingle();

    if (doctorError) {
      logger.warn('[pharmacy/orders/clarify] Doctor notification lookup failed', doctorError);
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
        logger.warn('[pharmacy/orders/clarify] Notification insert failed', notificationError);
      }
    }

    return jsonOk({
      clarificationId: clarification.id,
      orderStatus: 'clarification_requested',
      expiresAt,
    }, 201);
  } catch (err) {
    logger.error('[pharmacy/orders/clarify] POST error', err);
    return internalError();
  }
};
