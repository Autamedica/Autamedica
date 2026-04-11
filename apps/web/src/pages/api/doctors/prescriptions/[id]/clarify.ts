import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { badRequest, conflict, forbidden, internalError, jsonOk, notFound, unauthorized } from '@/lib/api-helpers';
import { resolveDoctorContext } from '@/lib/doctors/api/doctor-context';
import { createAstroAdminClient } from '@/lib/supabase';

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
  const prescriptionId = params.id;
  if (!prescriptionId) return badRequest('missing_prescription_id');

  const context = await resolveDoctorContext(request, locals);
  if (!context) return unauthorized();

  try {
    const body = await request.json().catch(() => null) as {
      clarification_id?: unknown;
      response?: unknown;
    } | null;

    const clarificationId = typeof body?.clarification_id === 'string'
      ? body.clarification_id.trim()
      : '';
    const responseText = typeof body?.response === 'string'
      ? body.response.trim()
      : '';

    if (!clarificationId || !responseText) {
      return badRequest('clarification_id_and_response_required');
    }

    const admin = createAstroAdminClient(getRuntimeEnv(locals));

    const { data: prescription, error: prescriptionError } = await admin
      .from('prescriptions')
      .select('id, doctor_id')
      .eq('id', prescriptionId)
      .maybeSingle();

    if (prescriptionError) {
      logger.error('[doctors/prescriptions/:id/clarify] Prescription lookup failed', prescriptionError);
      return internalError();
    }

    if (!prescription) {
      return notFound('prescription_not_found');
    }

    if (prescription.doctor_id !== context.doctorId) {
      return forbidden('forbidden_prescription_access');
    }

    const { data: clarification, error: clarificationError } = await admin
      .from('dispensation_clarifications')
      .select('id, order_id, requested_by, status')
      .eq('id', clarificationId)
      .maybeSingle();

    if (clarificationError) {
      logger.error('[doctors/prescriptions/:id/clarify] Clarification lookup failed', clarificationError);
      return internalError();
    }

    if (!clarification) {
      return notFound('clarification_not_found');
    }

    if (clarification.status !== 'pending') {
      return conflict('clarification_not_pending');
    }

    const { data: order, error: orderError } = await admin
      .from('dispensation_orders')
      .select('id, prescription_id, doctor_id, status')
      .eq('id', clarification.order_id)
      .maybeSingle();

    if (orderError) {
      logger.error('[doctors/prescriptions/:id/clarify] Order lookup failed', orderError);
      return internalError();
    }

    if (!order) {
      return notFound('dispensation_order_not_found');
    }

    if (order.prescription_id !== prescriptionId || order.doctor_id !== context.doctorId) {
      return forbidden('forbidden_prescription_access');
    }

    if (order.status !== 'clarification_requested') {
      return conflict('order_not_waiting_for_clarification');
    }

    const respondedAt = new Date().toISOString();

    const { error: updateClarificationError } = await admin
      .from('dispensation_clarifications')
      .update({
        responded_by: context.userId,
        response: responseText,
        response_decision: 'confirmed',
        status: 'responded',
        responded_at: respondedAt,
      })
      .eq('id', clarificationId);

    if (updateClarificationError) {
      logger.error('[doctors/prescriptions/:id/clarify] Clarification update failed', updateClarificationError);
      return internalError();
    }

    const { error: updateOrderError } = await admin
      .from('dispensation_orders')
      .update({ status: 'clarification_provided' })
      .eq('id', order.id);

    if (updateOrderError) {
      logger.error('[doctors/prescriptions/:id/clarify] Order update failed', updateOrderError);
      return internalError();
    }

    await admin
      .from('pharmacy_audit_events')
      .insert({
        order_id: order.id,
        event_type: 'clarification_responded',
        actor_id: context.userId,
        actor_role: 'doctor',
        details: {
          clarification_id: clarificationId,
          response: responseText,
          response_decision: 'confirmed',
        },
        ip_address: getClientIp(request),
      })
      .then(({ error }) => {
        if (error) {
          logger.warn('[doctors/prescriptions/:id/clarify] Audit insert failed', error);
        }
      });

    if (clarification.requested_by) {
      const notificationError = await insertNotification(admin, {
          user_id: clarification.requested_by,
          type: 'clarification_responded',
          title: 'Aclaración respondida por el prescriptor',
          body: responseText,
          data: {
            orderId: order.id,
            clarificationId,
          },
          read: false,
          created_at: respondedAt,
        });

      if (notificationError) {
        logger.warn('[doctors/prescriptions/:id/clarify] Notification insert failed', notificationError);
      }
    }

    return jsonOk({
      clarificationId,
      orderStatus: 'clarification_provided',
      respondedAt,
    });
  } catch (error) {
    logger.error('[doctors/prescriptions/:id/clarify] POST error', error);
    return internalError();
  }
};
